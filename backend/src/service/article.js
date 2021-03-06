const require3 = require('require3');
const trimHtml = require3('@zhennann/trim-html');
const markdown = require3('@zhennann/markdown');
const markdonw_it_block = require3('@zhennann/markdown-it-block');
const uuid = require3('uuid');

module.exports = app => {
  const moduleInfo = app.meta.mockUtil.parseInfoFromPackage(__dirname);
  class Article extends app.Service {

    async create({ atomClass, key, item, user }) {
      const site = await this.ctx.service.render.combineSiteBase({ atomClass });
      const editMode = site.edit.mode;
      // add article
      const params = {
        atomId: key.atomId,
        editMode,
      };
      if (item.language) params.language = item.language;
      if (item.categoryId) params.categoryId = item.categoryId;
      // uuid
      params.uuid = item.uuid || uuid.v4().replace(/-/g, '');
      // insert
      const res = await this.ctx.model.article.insert(params);
      const itemId = res.insertId;
      // add content
      await this.ctx.model.content.insert({
        atomId: key.atomId,
        itemId,
        content: '',
      });
      return { atomId: key.atomId, itemId };
    }

    _getMeta(item, showSorting) {
      // flags
      const flags = [];
      if (item.sticky) flags.push(this.ctx.text('Sticky'));
      if (item.sorting && showSorting) flags.push(item.sorting);
      // meta
      const meta = {
        summary: item.summary,
        flags,
      };
      // ok
      item._meta = meta;
    }

    async read({ atomClass, key, item, user }) {
      // read: showSorting=true
      this._getMeta(item, true);
    }

    async select({ atomClass, options, items, user }) {
      const showSorting = options && options.where && options.where.categoryId;
      // select
      for (const item of items) {
        this._getMeta(item, showSorting);
      }
    }

    async write({ atomClass, key, item, user }) {
      // get atom for safety
      const atomOld = await this.ctx.meta.atom.read({ key, user });
      // if undefined then old
      const fields = [ 'slug', 'editMode', 'content', 'language', 'categoryId', 'sticky', 'keywords', 'description', 'sorting', 'flag', 'extra' ];
      for (const field of fields) {
        if (item[field] === undefined) item[field] = atomOld[field];
      }

      // url
      let url;
      if (item.slug) {
        url = `articles/${item.slug}.html`;
      } else {
        url = `articles/${atomOld.uuid}.html`;
      }
      // image first
      let imageFirst = '';
      if (item.editMode === 1) {
        const matches = item.content && item.content.match(/!\[[^\]]*?\]\(([^\)]*?)\)/);
        imageFirst = (matches && matches[1]) || '';
      }
      // audio first
      let audioFirst = '';
      let audioCoverFirst = '';
      if (item.editMode === 1) {
        const matches = item.content && item.content.match(/\$\$\$\s*cms-pluginblock:audio([\s\S]*?)\$\$\$/);
        let options = matches && matches[1];
        if (options) {
          options = global.JSON5.parse(options);
          if (options && options.audio) {
            if (Array.isArray(options.audio)) {
              audioFirst = options.audio[0].url;
              audioCoverFirst = options.audio[0].cover;
            } else {
              audioFirst = options.audio.url;
              audioCoverFirst = options.audio.cover;
            }
          }
        }
      }
      // markdown
      const md = markdown.create();
      // markdown-it-block
      const blocks = this.ctx.service.site.getBlocks({ locale: item.language });
      // block options
      const blockOptions = {
        utils: {
          text: (...args) => {
            return this.ctx.text.locale(item.language, ...args);
          },
        },
        blocks,
      };
      md.use(markdonw_it_block, blockOptions);
      // html
      let html;
      if (item.editMode === 1) {
        html = item.content ? md.render(item.content) : '';
      } else {
        html = item.content || '';
      }
      // summary
      const summary = trimHtml(html, this.ctx.config.article.trim);
      // update article
      await this.ctx.model.article.update({
        id: key.itemId,
        language: item.language,
        categoryId: item.categoryId,
        sticky: item.sticky,
        keywords: item.keywords,
        description: item.description,
        summary: summary.html,
        url,
        editMode: item.editMode,
        slug: item.slug,
        sorting: item.sorting,
        flag: item.flag,
        extra: item.extra || '{}',
        imageFirst,
        audioFirst,
        audioCoverFirst,
      });
      // update content
      await this.ctx.model.query('update aCmsContent a set a.content=?, a.html=? where a.iid=? and a.atomId=?',
        [ item.content, html, this.ctx.instance.id, key.atomId ]);

      // tags
      const tagsNew = await this.ctx.service.tag.updateArticleTags({ atomClass, key, item });

      // set tag count , force check if delete tags
      // if (atomOld.atomFlag === 2) {
      await this.ctx.service.tag.setTagArticleCount({ tagsNew, tagsOld: atomOld.tags });
      // }

      // render
      await this._renderArticle({ atomClass, key, inner: atomOld.atomFlag !== 2 });
    }

    async delete({ atomClass, key, user }) {
      // get atom for safety
      const atomOld = await this.ctx.meta.atom.read({ key, user });

      // delete article
      await this.ctx.model.article.delete({
        id: key.itemId,
      });
      // delete content
      await this.ctx.model.content.delete({
        itemId: key.itemId,
      });

      // delete tags
      await this.ctx.service.tag.deleteArticleTags({ key });

      // set tag count , force check if delete tags
      // if (atomOld.atomFlag === 2) {
      await this.ctx.service.tag.setTagArticleCount({ tagsNew: null, tagsOld: atomOld.tags });
      // }

      // delete article
      await this._deleteArticle({ atomClass, key, article: atomOld, inner: atomOld.atomFlag !== 2 });
    }

    async action({ action, atomClass, key, user }) {
      if (action === 101) {
        // get atom for safety
        const atomOld = await this.ctx.meta.atom.read({ key, user });

        // change flag
        await this.ctx.meta.atom.flag({
          key,
          atom: { atomFlag: 2 },
          user,
        });
        // change flow
        await this.ctx.meta.atom.flow({
          key,
          atom: { atomFlow: 0 },
          user,
        });

        // tags
        if (atomOld.atomFlag !== 2) {
          await this.ctx.service.tag.setTagArticleCount({ tagsOld: atomOld.tags });
        }

        // render
        await this._renderArticle({ atomClass, key, inner: false });
      } else {
        // other custom action
        //   always render again
        await this._renderArticle({ atomClass, key, inner: false });
      }
    }

    async enable({ atomClass, key, atom, user }) {
      // enable
      const atomFlag = atom.atomEnabled ? 1 : 0;
      // change flag
      await this.ctx.meta.atom.flag({
        key,
        atom: { atomFlag },
        user,
      });
      // site
      const site = await this.ctx.service.render.combineSiteBase({ atomClass });
      // if (this.ctx.config.article.publishOnSubmit) {
      if (site.base.publishOnSubmit !== false) {
        // publish
        await this.action({ action: 101, atomClass, key, user });
      }
    }

    async _deleteArticle({ atomClass, key, article, inner }) {
      this.ctx.tail(async () => {
        // queue not async
        await this.ctx.app.meta.queue.push({
          locale: this.ctx.locale,
          subdomain: this.ctx.subdomain,
          module: moduleInfo.relativeName,
          queueName: 'render',
          queueNameSub: `${atomClass.module}:${atomClass.atomClassName}`,
          data: {
            queueAction: 'deleteArticle',
            atomClass, key, article, inner,
          },
        });
      });
    }

    async _renderArticle({ atomClass, key, inner }) {
      this.ctx.tail(async () => {
        // queue not async
        await this.ctx.app.meta.queue.push({
          locale: this.ctx.locale,
          subdomain: this.ctx.subdomain,
          module: moduleInfo.relativeName,
          queueName: 'render',
          queueNameSub: `${atomClass.module}:${atomClass.atomClassName}`,
          data: {
            queueAction: 'renderArticle',
            atomClass, key, inner,
          },
        });
      });
    }

    async _getArticle({ key, inner }) {
      if (!inner) {
      // check right
        const roleAnonymous = await this.ctx.meta.role.getSystemRole({ roleName: 'anonymous' });
        const right = await this.ctx.meta.atom.checkRoleRightRead({ atom: { id: key.atomId }, roleId: roleAnonymous.id });
        if (!right) return null;
      }
      // article
      const article = await this.ctx.meta.atom.read({ key, user: { id: 0 } });
      if (!article) return null;
      // check language
      if (!article.language) this.ctx.throw(1001);
      return article;
    }

  }

  return Article;
};
