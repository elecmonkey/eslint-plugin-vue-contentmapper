# eslint-plugin-vue-contentmapper

> [!NOTE]
> This plugin runs ESLint core and typescript-eslint rules on Vue SFCs. `vue/*` rules come from [eslint-plugin-vue](https://eslint.vuejs.org), or optionally from [Vize](https://github.com/ubugeeei-prod/vize).

PoC: lint `.vue` files through the TypeScript that `@vue/content-mapper` ([vuejs/language-tools#6170](https://github.com/vuejs/language-tools/pull/6170)) generates for them.

Each `.vue` file is transformed into virtual TypeScript and linted as is. Reports are mapped back to the original file through the content mapper's span mappings; reports that cannot be mapped back, i.e. those on generated code, are dropped.

The original SFC is linted as a second block by eslint-plugin-vue (`configs.vue`) or Vize (`configs.vize`). Their rules that the virtual code already covers, such as `vue/no-unused-vars` and extensions of core rules other than layout ones, are turned off. Core and typescript-eslint rules belong on the virtual code blocks, `**/*.vue/*.{js,jsx,ts,tsx}`, not on `**/*.vue`.

`vue({ preset, layout })` and `vize({ preset, helpLevel })` build these configs with options; `vue({ layout: false })` turns off layout rules when a formatter such as oxfmt or Prettier formats `.vue` files. `pluginVue` is the eslint-plugin-vue they use.

![ESLint reports from example/App.vue shown in the editor, in both script and template](docs/example.webp)

Content mappers are a built-in mechanism of tsgo (TypeScript 7), so tsgo-based linters such as [Rslint](https://rslint.rs) could build on them to lint DSLs with strongly consistent semantics: the code they lint would be exactly what the type checker sees.
