# GitHub System Integration

Built-in Xpert plugin for shared GitHub App configuration. It is loaded automatically
at API startup and registers the `github` provider through `IntegrationStrategy`.

Configure GitHub under **Settings → System Integrations**. Credentials remain in the
existing Integration record; this plugin has no separate credential configuration.

| Setting                    | Purpose                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `appName`                  | Human-readable GitHub App name; existing values are retained.  |
| `appSlug`                  | App URL identifier, for example `code-xpertai`.                |
| `appId`                    | Numeric GitHub App ID, stored as a string.                     |
| `clientId`, `clientSecret` | GitHub user authorization through the GitHub Connector.        |
| `privateKey`               | PEM key used by consumers for GitHub App authentication.       |
| `webhookSecret`            | Optional shared secret; when supplied, at least 32 characters. |

Select the same System Integration in the GitHub Connector and Code Review plugin.
This provider owns the configuration schema and validation. The Connector owns
GitHub authorization; Code Review owns review callbacks and execution.

## Compatibility

No database migration, record recreation or reauthorization is required by this
move. The `github` provider key, Integration IDs, scopes, slugs and option field names
are unchanged. Existing OAuth-only configurations remain valid. Adding App settings
to the same record preserves its saved OAuth credentials.

Partial updates retain omitted settings. Empty, whitespace-only or omitted secret
inputs retain existing secrets; a nonempty value rotates a secret. Shared GitHub DTO
exports remain in `@xpert-ai/contracts`, while provider discovery uses the host API.

The integration test action validates configuration locally. It does not contact
GitHub or assert that credentials, repository access or webhook delivery work.

## Development

From the Xpert repository root:

```sh
corepack pnpm nx build contracts
corepack pnpm nx build plugin-sdk
corepack pnpm nx build github-integration
corepack pnpm nx test github-integration --runInBand
```

The host invokes the optional, provider-independent `prepareConfig(config, previous)`
hook before validation on create/update. Previous options are passed only when the
provider is unchanged. GitHub-specific merging and validation stay in this folder.

See [plugin documentation](docs/index.mdx) for setup and upgrade details.
