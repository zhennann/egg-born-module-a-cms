<template>
  <eb-page>
    <eb-navbar large largeTransparent :title="title" eb-back-link="Back">
      <f7-nav-right>
        <eb-link iconMaterial="done" :onPerform="onPerformDone"></eb-link>
      </f7-nav-right>
    </eb-navbar>
    <eb-validate v-if="moduleBlock" ref="validate" :readOnly="false" auto :data="item" :params="validateParams" :meta="meta" :onPerform="onPerformValidate" @submit.prevent="onSubmit">
    </eb-validate>
  </eb-page>
</template>
<script>
import Vue from 'vue';
const ebPageContext = Vue.prototype.$meta.module.get('a-components').options.mixins.ebPageContext;
export default {
  mixins: [ebPageContext],
  data() {
    return {
      block: null,
      item: null,
      meta: null,
      moduleBlock: null,
    };
  },
  computed: {
    title() {
      if (!this.block) return this.$text('Block');
      return `${this.$text('Block')}: ${this.block.meta.titleLocale}`;
    },
    validateParams() {
      if (!this.block) return null;
      return {
        module: this.block.meta.module,
        validator: this.block.meta.validator,
      };
    },
  },
  mounted() {
    this.block = this.contextParams.block;
    this.item = this.block.data.default;
    this.meta = {
      atomId: this.contextParams.atomId,
    };
    this.$meta.module.use(this.block.meta.module, module => {
      this.moduleBlock = module;
    });
  },
  methods: {
    onPerformValidate() {
      const blockName = this.block.meta.fullName;
      return this.$api.post('site/blockSave', {
        blockName,
        item: this.item,
      }).then(data => {
        // callback
        this.contextCallback(200, { name: blockName, content: data });
        // close view
        this.$view.close();
      });
    },
    onPerformDone() {
      return this.$refs.validate.perform();
    },
    onSubmit() {
      return this.onPerformDone();
    },
  },
};

</script>
<style scoped>
</style>
