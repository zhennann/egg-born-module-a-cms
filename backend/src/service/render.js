const path = require('path');
const require3 = require('require3');
const ejs = require3('@zhennann/ejs');
const pMap = require3('p-map');
const extend = require3('extend2');
const uuid = require3('uuid');
const fse = require3('fs-extra');
const moment = require3('moment');
const glob = require3('glob');
const bb = require3('bluebird');
const CleanCSS = require3('clean-css');
const shajs = require3('sha.js');
const babel = require3('babel-core');
const UglifyJS = require3('uglify-js');

module.exports = app => {

  class Render extends app.Service {

    async renderAllFiles({ language }) {
      // clearCache
      ejs.clearCache();
      // site
      const site = await this.getSite({ language });
      // render static
      await this._renderStatic({ site });
      // render articles
      await this._renderArticles({ site });
      // render index
      await this._renderIndex({ site });
    }

    async renderArticle({ key, inner }) {
      // article
      const article = await this._getArticle({ key, inner });
      if (!article) return;
      // clearCache
      ejs.clearCache();
      // site
      const site = await this.getSite({ language: article.language });
      // render article
      await this._renderArticle({ site, article });
      if (!inner) {
        // write sitemap
        await this._writeSitemap({ site, article });
        // render index
        await this._renderIndex({ site });
      }
    }

    async deleteArticle({ key }) {
      // article
      const article = await this._getArticle({ key, inner: true });
      if (!article) return;
      // site
      const site = await this.getSite({ language: article.language });
      // remove file
      const pathDist = await this.getPathDist(site, article.language);
      await fse.remove(path.join(pathDist, article.url));
      // remove sitemap
      let xml = await fse.readFile(path.join(pathDist, 'sitemap.xml'));
      const regexp = new RegExp(` {2}<url>\\s+<loc>[^<]*${article.url}[^<]*</loc>[\\s\\S]*?</url>[\\r\\n]`);
      xml = xml.toString().replace(regexp, '');
      // save
      await fse.writeFile(path.join(pathDist, 'sitemap.xml'), xml);
    }

    async getArticleUrl({ key }) {
      // article
      const article = await this._getArticle({ key, inner: true });
      if (!article) return;
      // site
      const site = await this.getSite({ language: article.language });
      // url
      return {
        relativeUrl: article.url,
        url: this.getUrl(site, site.language.current, article.url),
      };
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

    async _renderArticles({ site }) {
      // anonymous user
      let userId;
      const user = await this.ctx.meta.user.get({ anonymous: true });
      if (user) {
        userId = user.id;
      } else {
        userId = await this.ctx.meta.user.anonymous();
      }
      // articles
      const articles = await this.ctx.meta.atom.select({
        atomClass: { module: 'a-cms', atomClassName: 'article' },
        options: {
          where: {
            'a.atomFlag': 2,
            'f.language': site.language.current,
          },
          orders: [[ 'a.updatedAt', 'desc' ]],
          page: null,
          mode: 'search',
        },
        user: { id: userId },
        pageForce: false,
      });
      // concurrency
      const mapper = article => {
        // render article
        return this._renderArticle({ site, article });
      };
      await pMap(articles, mapper, { concurrency: 10 });
      // write sitemap
      await this._writeSitemaps({ site, articles });
    }

    async _renderStatic({ site }) {
      // static
      const pathIntermediate = await this.getPathIntermediate(site.language.current);
      const staticFiles = await bb.fromCallback(cb => {
        glob(`${pathIntermediate}/static/\*\*/\*.ejs`, cb);
      });
      for (const item of staticFiles) {
        // data
        const data = await this.getData({ site });
        // path
        const _fileSrc = item.substr(pathIntermediate.length + 1);
        await this._renderFile({
          fileSrc: _fileSrc,
          fileDest: _fileSrc.replace('.ejs', '.html'),
          data,
        });
      }
    }

    async _renderIndex({ site }) {
      // index
      const pathIntermediate = await this.getPathIntermediate(site.language.current);
      const indexFiles = await bb.fromCallback(cb => {
        glob(`${pathIntermediate}/main/index/\*\*/\*.ejs`, cb);
      });
      for (const item of indexFiles) {
        // data
        const data = await this.getData({ site });
        // path
        const _fileSrc = item.substr(pathIntermediate.length + 1);
        const _fileDest = _fileSrc.substr('main/index/'.length).replace('.ejs', '.html');
        await this._renderFile({
          fileSrc: _fileSrc,
          fileDest: _fileDest,
          data,
        });
      }
    }

    async _writeSitemap({ site, article }) {
      const loc = this.getUrl(site, site.language.current, article.url);
      const lastmod = moment(article.updatedAt).format();
      // load
      const pathDist = await this.getPathDist(site, site.language.current);
      const fileName = path.join(pathDist, 'sitemap.xml');
      let xml;
      const exists = await fse.pathExists(fileName);
      if (!exists) {
        xml =
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>
</urlset>`;
      } else {
        xml = await fse.readFile(fileName);
        xml = xml.toString();
        // remove
        const regexp = new RegExp(` {2}<url>\\s+<loc>[^<]*${article.url}[^<]*</loc>[\\s\\S]*?</url>[\\r\\n]`);
        xml = xml.replace(regexp, '');
        // append
        xml = xml.replace('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`);
      }
      // save
      await fse.writeFile(fileName, xml);
    }

    async _writeSitemaps({ site, articles }) {
      // xml
      let xml =
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;
      for (const article of articles) {
        const loc = this.getUrl(site, site.language.current, article.url);
        const lastmod = moment(article.updatedAt).format();
        xml +=
`  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>
`;
      }
      xml += '</urlset>';
      // save
      const pathDist = await this.getPathDist(site, site.language.current);
      const fileName = path.join(pathDist, 'sitemap.xml');
      await fse.writeFile(fileName, xml);
    }

    async _renderArticle({ site, article }) {
      // data
      const data = await this.getData({ site });
      data.article = article;
      // url
      let url;
      if (article.slug) {
        url = `articles/${article.slug}.html`;
      } else {
        url = article.url || `articles/${uuid.v4().replace(/-/g, '')}.html`;
      }
      await this._renderFile({
        fileSrc: 'main/article.ejs',
        fileDest: url,
        data,
      });
      // save
      await this.ctx.model.article.update({
        id: article.id,
        url,
      });
      article.url = url;
    }

    async _renderFile({ fileSrc, fileDest, data }) {
      // env path
      data.env('path', fileSrc.replace('.ejs', ''));
      // language
      const language = data.site.language.current;
      // src
      const pathIntermediate = await this.getPathIntermediate(language);
      const fileName = path.join(pathIntermediate, fileSrc);
      // data
      data._filename = fileName;
      // render
      let content = await ejs.renderFile(fileName, data, this.getOptions());
      content = await this._renderEnvs({ data, content });
      content = await this._renderCSSJSes({ data, content });
      // dest
      const pathDist = await this.getPathDist(data.site, language);
      const fileWrite = path.join(pathDist, fileDest);
      // write
      await fse.outputFile(fileWrite, content);
    }

    async _renderCSSJSes({ data, content }) {
      content = await this._renderCSSJS({ data, content, type: 'CSS', items: data._csses });
      content = await this._renderCSSJS({ data, content, type: 'JS', items: data._jses });
      return content;
    }

    async _renderCSSJS({ data, content, type, items }) {
      if (items.length === 0) return content;
      // site
      const site = data.site;
      // cache
      if (!site._cache) site._cache = {};
      if (!site._cache[type])site._cache[type] = {};
      const cacheSha = shajs('sha256').update(items.join(',')).digest('hex');
      let urlDest;
      if (site._cache[type][cacheSha]) {
        urlDest = site._cache[type][cacheSha];
      } else {
        // combine
        let result = '';
        for (const item of items) {
          let _content;
          if (path.extname(item) === '.ejs') {
            // data
            data._filename = item;
            _content = await ejs.renderFile(item, data, this.getOptions());
          } else {
            _content = await fse.readFile(item);
          }
          result += _content + '\n';
        }
        // minify
        if (type === 'CSS') {
          const output = new CleanCSS().minify(result);
          result = output.styles;
        } else {
          result = babel.transform(result, { ast: false, babelrc: false, presets: [ 'env' ] }).code;
          const output = UglifyJS.minify(result);
          if (output.error) throw new Error(`${output.error.name}: ${output.error.message}`);
          result = output.code;
        }
        // save
        const sha = shajs('sha256').update(result).digest('hex');
        // dest
        const fileDest = `assets/${type.toLowerCase()}/${sha}.${type.toLowerCase()}`;
        const pathDist = await this.getPathDist(site, site.language.current);
        const fileWrite = path.join(pathDist, fileDest);
        // write
        await fse.outputFile(fileWrite, result);
        // url
        urlDest = this.getUrl(site, site.language.current, fileDest);
        // cache
        site._cache[type][cacheSha] = urlDest;
      }
      // replace
      const regexp = new RegExp(`__${type}__`);
      return content.replace(regexp, urlDest);
    }

    async _renderEnvs({ data, content }) {
      // site
      const site = data.site;
      // env
      const _env = {};
      for (const name of Object.keys(data._envs)) {
        let value;
        const keys = name.split('.');
        for (let index = keys.length - 1; index >= 0; index--) {
          const key = keys[index];
          value = value ? { [key]: value } : { [key]: data._envs[name] };
        }
        extend(true, _env, value);
      }
      // combine
      const env = extend(true, {
        base: site.base,
        language: site.language,
      }, site.env, _env);
      if (data.article) {
        env.article = extend(true, {}, data.article);
        delete env.article.content;
        delete env.article.text;
      }
      // replace
      const text = `
<script type="text/javascript">
var env=${JSON.stringify(env, null, 2)};
</script>
`;
      const regexp = new RegExp('__ENV__');
      return content.replace(regexp, text);
    }

    async getPathCustom(language) {
      const cms = await this.getPathCms();
      return path.join(cms, language, 'custom');
    }
    async getPathIntermediate(language) {
      const cms = await this.getPathCms();
      return path.join(cms, language, 'intermediate');
    }
    async getPathDist(site, language) {
      const rawDist = await this.getPathRawDist();
      return path.join(rawDist, language === site.language.default ? '' : '/' + language);
    }
    async getPathCms() {
      return await this.ctx.meta.file.getPath('cms');
    }
    async getPathRawDist() {
      return await this.ctx.meta.file.getPath('cms/dist');
    }

    getUrlRawRoot(site) {
      return `${site.host.url}${site.host.rootPath ? '/' + site.host.rootPath : ''}`;
    }
    getUrlRoot(site, language) {
      const rawRoot = this.getUrlRawRoot(site);
      return `${rawRoot}${language === site.language.default ? '' : '/' + language}`;
    }
    getUrl(site, language, path) {
      const urlRoot = this.getUrlRoot(site, language);
      return `${urlRoot}/${path}`;
    }
    getServerUrl(path) {
      return this.ctx.meta.file.getUrl(path);
    }

    async getData({ site }) {
      // categories
      if (!site.categories) {
        site.categories = await this.ctx.service.category.tree({ language: site.language.current, hidden: 0 });
      }
      // languages
      if (!site.languages) {
        site.languages = [];
        for (const item of site.language.items.split(',')) {
          site.languages.push({
            name: item,
            title: this.ctx.text.locale(item, item),
            url: this.getUrl(site, item, ''),
          });
        }
      }
      // server url
      if (!site.serverUrl) {
        site.serverUrl = this.getServerUrl('');
        console.log(site.serverUrl);
      }
      // data
      const self = this;
      const _csses = [];
      const _jses = [];
      const _envs = {};
      let _pathIntermediate = await this.getPathIntermediate(site.language.current);
      _pathIntermediate = path.join(_pathIntermediate, '/');
      return {
        ctx: self.ctx,
        site,
        _csses,
        _jses,
        _envs,
        require(fileName) {
          const _path = self.resolvePath('', this._filename, fileName);
          return require(_path);
        },
        url(fileName) {
          const _path = self.resolvePath('', path.relative(_pathIntermediate, this._filename), fileName);
          return self.getUrl(site, site.language.current, _path);
        },
        css(fileName) {
          _csses.push(self.resolvePath(_pathIntermediate, this._filename, fileName));
        },
        js(fileName) {
          _jses.push(self.resolvePath(_pathIntermediate, this._filename, fileName));
        },
        env(name, value) {
          _envs[name] = value;
        },
        text(str) {
          return this.ctx.text.locale(site.language.current, str);
        },
      };
    }

    resolvePath(pathRoot, fileCurrent, fileName) {
      if (!fileName) return pathRoot;
      if (fileName.charAt(0) === '.') return path.join(path.dirname(fileCurrent), fileName); // not use path.resolve
      return path.join(pathRoot, fileName);
    }

    getOptions() {
      return {
        async: true,
        cache: true,
        compileDebug: this.ctx.app.meta.isTest || this.ctx.app.meta.isLocal,
        outputFunctionName: 'echo',
      };
    }

    // site<plugin<theme<site(db)<language(db)
    async getSite({ language }) {
      const siteBase = await this.combineSiteBase();
      return await this.combineSite({ siteBase, language });
    }

    // site<plugin<theme<site(db)<language(db)
    async combineSiteBase() {
      // site
      const site = await this.ctx.service.site.getConfigSiteBase();
      // site(db) special for language/themes
      const configSite = await this.ctx.service.site.getConfigSite();
      if (configSite && configSite.language) site.language = configSite.language;
      if (configSite && configSite.themes) site.themes = configSite.themes;
      return site;
    }

    // site<plugin<theme<site(db)<language(db)
    async combineSite({ siteBase, language }) {
      // themeModuleName
      const themeModuleName = siteBase.themes[language];
      if (!themeModuleName) this.ctx.throw(1002);
      // theme
      const theme = this.ctx.config.module(themeModuleName).theme;
      // site(db)
      const configSite = await this.ctx.service.site.getConfigSite();
      // language(db)
      const configLanguage = await this.ctx.service.site.getConfigLanguage({ language });
      // combine
      return extend(true, {},
        siteBase, theme, configSite, configLanguage,
        { language: { current: language } }
      );
    }

  }

  return Render;
};
