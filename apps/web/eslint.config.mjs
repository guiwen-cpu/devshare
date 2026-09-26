import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    // Nuxt 页面常见单数命名（index.vue、[slug].vue），关闭多词组件名限制
    'vue/multi-word-component-names': 'off',
    // eslint-plugin-vue v10 默认 void:'never'，要求 void 元素禁止自闭合（<img>）；
    // 但 prettier 会把多行 void 元素格式化为 <img ... />。二者冲突且 prettier 不可配，
    // 故此处对齐 prettier 输出，设为 void:'always'（亦是该规则文档推荐值）。
    'vue/html-self-closing': [
      'warn',
      {
        html: { normal: 'always', void: 'always', component: 'always' },
        svg: 'always',
        math: 'always',
      },
    ],
    '@typescript-eslint/no-explicit-any': 'off',
  },
})
