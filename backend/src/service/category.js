const utils = require('../common/utils.js');

module.exports = app => {

  class Category extends app.Service {

    async item({ categoryId }) {
      return await this.ctx.model.category.get({ id: categoryId });
    }

    async save({ categoryId, data }) {
      await this.ctx.model.category.update({
        id: categoryId,
        categoryName: data.categoryName,
        hidden: data.hidden,
        sorting: data.sorting,
        flag: data.flag,
        url: data.url,
      });
    }

    async children({ atomClass, language, categoryId, hidden, flag }) {
      //
      const where = {
        categoryIdParent: categoryId || 0,
      };
      // atomClassId
      if (where.categoryIdParent === 0) {
        const _atomClass = await utils.atomClass2(this.ctx, atomClass);
        where.atomClassId = _atomClass.id;
      }
      //
      if (language !== undefined) where.language = language;
      if (hidden !== undefined) where.hidden = hidden;
      if (flag !== undefined) where.flag = flag;
      const list = await this.ctx.model.category.select({
        where,
        orders: [[ 'sorting', 'asc' ], [ 'createdAt', 'asc' ]],
      });
      return list;
    }

    async add({ categoryName, language, categoryIdParent }) {
      // add
      const res = await this.ctx.model.category.insert({
        categoryName,
        language,
        catalog: 0,
        hidden: 0,
        sorting: 0,
        categoryIdParent,
      });
      // adjust catalog
      await this.adjustCatalog(categoryIdParent);

      return res.insertId;
    }

    async delete({ categoryId }) {
      // check articles
      const list = await this.ctx.model.article.select({ where: { categoryId } });
      if (list.length > 0) this.ctx.throw(1005);
      // check children
      const children = await this.children({ categoryId });
      if (children.length > 0) this.ctx.throw(1004);
      // category
      const category = await this.ctx.model.category.get({ id: categoryId });
      // parent
      const categoryIdParent = category.categoryIdParent;
      // delete
      await this.ctx.model.category.delete({ id: categoryId });
      // adjust catalog
      await this.adjustCatalog(categoryIdParent);
    }

    async move({ categoryId, categoryIdParent }) {
      // category
      const category = await this.ctx.model.category.get({ id: categoryId });
      // categoryIdParentOld
      const categoryIdParentOld = category.categoryIdParent;
      // move
      await this.ctx.model.category.update({
        id: categoryId,
        categoryIdParent,
      });
      // adjust catalog
      await this.adjustCatalog(categoryIdParentOld);
      await this.adjustCatalog(categoryIdParent);
    }

    async adjustCatalog(categoryId) {
      if (categoryId === 0) return;
      const children = await this.children({ categoryId });
      await this.ctx.model.category.update({
        id: categoryId,
        catalog: children.length === 0 ? 0 : 1,
      });
    }

    async tree({ atomClass, language, categoryId, hidden, flag }) {
      return await this._treeChildren({ atomClass, language, categoryId, hidden, flag });
    }

    async _treeChildren({ atomClass, language, categoryId, hidden, flag }) {
      const list = await this.children({ atomClass, language, categoryId, hidden, flag });
      for (const item of list) {
        if (item.catalog) {
          // only categoryId
          item.children = await this._treeChildren({ atomClass, categoryId: item.id });
        }
      }
      return list;
    }

    async relativeTop({ categoryId }) {
      return await this._relativeTop({ categoryId });
    }

    async _relativeTop({ categoryId }) {
      const category = await this.item({ categoryId });
      if (!category) return null;
      if (category.url) return category;
      return await this._relativeTop({ categoryId: category.categoryIdParent });
    }

  }

  return Category;
};
