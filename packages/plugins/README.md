# Plugins

How to generate a new plugin library:

```bash
npx nx g @nx/js:lib packages/plugins/my-plugin --importPath=@xpert-ai/plugin-my-plugin --unitTestRunner=jest --publishable --bundler=rollup
```
