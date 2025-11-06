# Plugins

How to generate a new plugin library, replace `my-plugin` with your plugin name and import path:

```bash
npx nx g @nx/js:lib packages/plugins/my-plugin --importPath=@xpert-ai/plugin-my-plugin --unitTestRunner=jest --publishable --bundler=rollup --linter=eslint
```
