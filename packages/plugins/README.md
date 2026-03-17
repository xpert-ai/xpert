# Plugins

How to generate a new plugin library, replacing `my-plugin` with your plugin name and import path:

```bash
npx nx g @nx/js:lib packages/plugins/my-plugin --importPath=@xpert-ai/plugin-my-plugin --unitTestRunner=jest --publishable --bundler=rollup --linter=eslint
```

## Build wiring

- Add `yarn nx build my-plugin` to `build:plugins` in the root `package.json`.
- Add the same build command to the deployment package manifest if that environment builds plugins separately.

## External dependencies

Add external dependencies in the plugin's `project.json`:

```json
"external": [
  "@nestjs/common",
  "@nestjs/core"
]
```

Add more entries for any runtime dependencies that must stay external.

## Local runtime entry

Add `index.cjs` for local plugin loading when needed.

## Plugin configuration

If your plugin needs configuration:

1. define `config.schema` for validation when configuration is saved; install-time checks can surface a warning state without blocking installation
2. optionally define `config.formSchema` for the frontend form
3. read config through the host `PluginConfigResolver`

When `config.formSchema` is present, the Installed Plugins page can render a `Configure` dialog automatically with `JSONSchemaFormComponent`.
