import eslint from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

export default tseslint.config(
  {
    ignores: [
      '**/.nuxt/**',
      '**/.output/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/drizzle/**',
      'pencil.pen',
    ],
  },
  eslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['apps/web/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['apps/web/**/*.vue'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        $fetch: 'readonly',
      },
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  eslintConfigPrettier,
)
