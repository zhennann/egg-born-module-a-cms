<template>
  <eb-list form no-hairlines-md @submit="onSubmit">
    <f7-list-group>
      <f7-list-item group-title :title="$text('Title')"></f7-list-item>
      <eb-list-item-validate dataKey="atomName"></eb-list-item-validate>
    </f7-list-group>
    <f7-list-group>
      <f7-list-item group-title :title="$text('Content')"></f7-list-item>
      <eb-list-item-choose link="#" dataPath="content" :title="$text('Content')" :onChoose="onChooseEditContent">
      </eb-list-item-choose>
    </f7-list-group>
    <f7-list-group>
      <f7-list-item group-title :title="$text('Basic Info')"></f7-list-item>
      <eb-list-item-validate dataKey="language" :meta="{options:languages}"></eb-list-item-validate>
      <eb-list-item-choose link="#" dataPath="categoryId" :title="$text('Category')" :onChoose="onChooseCategory">
        <div slot="after">{{item.categoryName}}</div>
      </eb-list-item-choose>
      <eb-list-item-choose link="#" dataPath="tags" :title="$text('Tags')" :onChoose="onChooseTags">
        <div slot="after">{{adjustTags(item.tags)}}</div>
      </eb-list-item-choose>
      <eb-list-item-validate dataKey="keywords"></eb-list-item-validate>
      <eb-list-item-validate dataKey="description"></eb-list-item-validate>
      <eb-list-item-validate dataKey="slug"></eb-list-item-validate>
      <eb-list-item-validate dataKey="allowComment"></eb-list-item-validate>
    </f7-list-group>
    <f7-list-group>
      <f7-list-item group-title :title="$text('Extra')"></f7-list-item>
      <eb-list-item-validate dataKey="sticky"></eb-list-item-validate>
      <eb-list-item-validate dataKey="sorting"></eb-list-item-validate>
      <eb-list-item-validate dataKey="flag"></eb-list-item-validate>
      <eb-list-item-validate dataKey="extra"></eb-list-item-validate>
    </f7-list-group>
  </eb-list>
</template>
<script>
import utils from '../../common/utils.js';
export default {
  props: {
    readOnly: {
      type: Boolean,
    },
    item: {
      type: Object,
    },
    onSave: {
      type: Function,
    },
  },
  computed: {
    atomClass() {
      return {
        module: this.item.module,
        atomClassName: this.item.atomClassName,
      };
    },
    languages() {
      return this.$local.state.languages[this.atomClass.module];
    },
  },
  created() {
    this.$local.dispatch('getLanguages', {
      atomClass: this.atomClass,
    }).then(res => {
      if (res.length === 1) {
        this.item.language = res[0].value;
      }
    });
  },
  methods: {
    onSubmit(event) {
      this.$emit('submit', event);
    },
    combineAtomClass(url) {
      return utils.combineAtomClass(this.atomClass, url);
    },
    adjustTags(tags) {
      if (!tags) return '';
      const _tags = JSON.parse(tags);
      return _tags.map(item => item.name).join(',');
    },
    onChooseTags() {
      if (!this.item.language) {
        this.$view.dialog.alert(this.$text('Please specify the language'));
        return false;
      }
      return new Promise(resolve => {
        const url = this.combineAtomClass('/a/cms/tag/select');
        this.$view.navigate(url, {
          target: '_self',
          context: {
            params: {
              language: this.item.language,
              tags: this.item.tags,
            },
            callback: (code, data) => {
              if (code === 200) {
                this.item.tags = data;
                resolve(true);
              } else if (code === false) {
                resolve(false);
              }
            },
          },
        });
      });
    },
    onChooseCategory() {
      if (!this.item.language) {
        this.$view.dialog.alert(this.$text('Please specify the language'));
        return false;
      }
      return new Promise(resolve => {
        const url = this.combineAtomClass('/a/cms/category/select');
        this.$view.navigate(url, {
          target: '_self',
          context: {
            params: {
              language: this.item.language,
              categoryIdStart: 0,
              leafOnly: true,
            },
            callback: (code, node) => {
              if (code === 200) {
                this.item.categoryId = node.id;
                this.item.categoryName = node.data.categoryName;
                resolve(true);
              } else if (code === false) {
                resolve(false);
              }
            },
          },
        });
      });
    },
    onChooseEditContent() {
      if (!this.item.categoryId) {
        this.$view.dialog.alert(this.$text('Please specify the category name'));
        return false;
      }
      const url = this.combineAtomClass('/a/cms/article/contentEdit');
      this.$view.navigate(url, {
        context: {
          params: {
            ctx: this,
            item: this.item,
            readOnly: this.readOnly,
          },
          callback: (code, data) => {
            if (code === 200) {
              this.item.content = data.content;
            }
          },
        },
      });
    },
  },
};

</script>
<style scoped>
</style>
