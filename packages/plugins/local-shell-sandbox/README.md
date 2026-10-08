# Local Shell Sandbox (optional plugin)

`@xpert-ai/plugin-local-shell-sandbox` preserves the `local-shell-sandbox` provider,
including command execution, file transfer, managed services and interactive PTY
terminals. When `XPERT_LOCAL_SANDBOX_ENABLED=true`, API startup loads the plugin
through `preBootstrapPlugins` in system scope. Source checkouts can use the local
workspace package without a separate installation command. Default API and Web
images do not bundle this optional package; those deployments still need it installed.

- [Installation and migration](docs/quickstart.mdx)
- [Behavior and verification](docs/index.mdx)

Build from the repository root with `corepack pnpm nx build local-shell-sandbox`.
Run its regression suite with
`corepack pnpm exec jest --config packages/plugins/local-shell-sandbox/jest.config.cjs --runInBand`.
The distributable is `dist/packages/plugins/local-shell-sandbox`.
