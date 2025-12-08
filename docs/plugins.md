# Plugins

## Adding Plugins During Development

When adding plugins during the development phase, pay attention to the following points:

- The plugin must be declared in the built-in `preBootstrapPlugins` list.
- The plugin package should be added to the `dependencies` section of `apps/api/package.json`.
- The plugin package needs to be included in the `dependencies` section of `.deploy/api/package-prod.json`.

## Adding Plugins During Deployment

When adding plugins during the deployment phase, note the following:

- Plugins are declared in the `PLUGINS` environment variable, separated by commas if there are multiple plugins.

## Agent Middlewares

For details on implementing and wiring agent middlewares through plugins, see `docs/agent-middleware.md`.
