const require3 = require('require3');
const extend = require3('extend2');

module.exports = app => {

  class ArticleController extends app.Controller {

    async create() {
      const res = await this.ctx.service.article.create(this.ctx.request.body);
      this.ctx.success(res);
    }

    async read() {
      const res = await this.ctx.service.article.read(this.ctx.request.body);
      this.ctx.success(res);
    }

    async select() {
      const res = await this.ctx.service.article.select(this.ctx.request.body);
      this.ctx.success(res);
    }

    async write() {
      await this.ctx.service.article.write(this.ctx.request.body);
      this.ctx.success();
    }

    async delete() {
      await this.ctx.service.article.delete(this.ctx.request.body);
      this.ctx.success();
    }

    async action() {
      const res = await this.ctx.service.article.action(this.ctx.request.body);
      this.ctx.success(res);
    }

    async enable() {
      const res = await this.ctx.service.article.enable(this.ctx.request.body);
      this.ctx.success(res);
    }

    // list
    async list() {
      // options
      const options = JSON.parse(this.ctx.request.query.options);
      // filter drafts
      options.where = extend(true, options.where, {
        'a.atomEnabled': 1,
        'a.atomFlag': 2,
      });
      // select
      const res = await this.ctx.performAction({
        method: 'post',
        url: '/a/base/atom/select',
        body: {
          atomClass: {
            module: 'a-cms',
            atomClassName: 'article',
          },
          options,
        },
      });
      this.ctx.success(res);
    }

    // attachments
    async attachments() {
      // key
      const key = JSON.parse(this.ctx.request.query.key);
      // options
      const options = this.ctx.request.query.options ? JSON.parse(this.ctx.request.query.options) : {};
      // filter drafts
      options.where = extend(true, options.where, {
        mode: 2,
        attachment: 1,
      });
      if (!options.orders) {
        options.orders = [
          [ 'createdAt', 'asc' ],
        ];
      }
      // select
      const res = await this.ctx.performAction({
        method: 'post',
        url: '/a/file/file/list',
        body: {
          key,
          options,
        },
      });
      this.ctx.success(res);
    }

  }
  return ArticleController;
};

