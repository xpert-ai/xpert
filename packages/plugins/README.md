# Plugins

How to generate a new plugin library, replacing `my-plugin` with your plugin name and import path:

```bash
npx nx g @nx/js:lib packages/plugins/my-plugin --importPath=@xpert-ai/plugin-my-plugin --unitTestRunner=jest --publishable --bundler=rollup --linter=eslint
```

- Add the corresponding build command `pnpm nx build my-plugin` to `build:plugins` in *package.json*.
- Add the corresponding build command `pnpm nx build my-plugin` to `build:plugins` in *./.deploy/api/package.json*.

- Add external dependencies in plugin's *project.json*:

```json
"external": [
  "@nestjs/common",
  "@nestjs/core"
]
```

Add more entries for any runtime dependencies that must stay external.

- Keep `@xpert-ai/plugin-sdk` in `peerDependencies`, never `dependencies`.
- Use an explicit single-major range for `@xpert-ai/plugin-sdk`, for example `^3.8.0`.
- If local development needs an installed SDK copy, mirror the same range in `devDependencies`.

## Local runtime entry

Add `index.cjs` for local plugin loading when needed.

## Plugin configuration

If your plugin needs configuration:

1. define `config.schema` for validation when configuration is saved; install-time checks can surface a warning state without blocking installation
2. optionally define `config.formSchema` for the frontend form
3. read config through the host `PluginConfigResolver`

When `config.formSchema` is present, the Installed Plugins page can render a `Configure` dialog automatically with `JSONSchemaFormComponent`.
