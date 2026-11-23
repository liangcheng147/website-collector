// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', '.superpowers', 'src-tauri', 'e2e'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      // 让 vue-eslint-parser 把 <script setup lang="ts"> 交给 TS parser
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      // vue-eslint-parser 解析模板时，TS 的全局类型（document/window/Event 等）
      // 会被 no-undef 误报；TS 侧已由 typescript-eslint 覆盖，模板侧直接关掉。
      'no-undef': 'off',
      // 现有代码的模板排版并不统一（属性不换行、单行内容等）。整体重排会产生
      // 与迁移无关的巨大 diff，按现状设基线：关掉纯排版规则，保留 correctness。
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/html-indent': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/attributes-order': 'off',
      // 项目已有单单词组件名（Sidebar），重命名超出本任务范围。
      'vue/multi-word-component-names': 'off',
    },
  },
)
