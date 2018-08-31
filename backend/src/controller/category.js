module.exports = app => {

  class CategoryController extends app.Controller {

    async children() {
      const list = await this.ctx.service.category.children({
        language: this.ctx.request.body.language,
        categoryId: this.ctx.request.body.categoryId,
      });
      this.ctx.success({ list });
    }

    async add() {
      const res = await this.ctx.service.category.add(this.ctx.request.body.data);
      this.ctx.success(res);
    }

    async delete() {
      const res = await this.ctx.service.category.delete({
        categoryId: this.ctx.request.body.categoryId,
      });
      this.ctx.success(res);
    }

  }
  return CategoryController;
};

