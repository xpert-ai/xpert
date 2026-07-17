#!/usr/bin/env node

import process from 'node:process'
import {
  DEFAULT_API_URL,
  DEFAULT_KEYCHAIN_SERVICE,
  DEFAULT_PASSWORD_KEYCHAIN_SERVICE,
  DEFAULT_USERNAME_KEYCHAIN_SERVICE,
  assertResponseOk,
  createRequestHeaders,
  handleCliError,
  parseCliArgs,
  parsePluginConfig,
  postJson,
  redactRequestHeaders,
  requireAuthentication,
  resolvePluginEndpoint,
  resolvePluginInput,
  summarizePluginResponse
} from './local-plugin-cli.mjs'

const BOOLEAN_FLAGS = ['dryRun', 'help', 'noKeychain']

function printUsage() {
  console.log(`Install a local plugin workspace into a running Xpert API.

Usage:
  corepack pnpm plugin:install:local --workspace-path /abs/path/to/plugin --org-id <org-id> [options]
  corepack pnpm plugin:install:local <plugin-name> <workspace-path> --org-id <org-id> [options]

Options:
  --plugin-name <name>       Plugin package name. Defaults to package.json name
  --plugin-dir <path>        Plugin workspace. --workspace-path is also accepted
  --org-id <id>              Organization scope identifier
  --tenant-id <id>           Tenant scope identifier
  --scope <scope>            organization or tenant
  --token <jwt>              Bearer token; environment or Keychain is safer
  --username <identifier>    Xpert email or username; Keychain is preferred
  --password <password>      Xpert password; prefer Keychain or process environment
  --login-endpoint <url>     Login endpoint, default: <api-url>/api/auth/login
  --keychain-service <name>  Default: ${DEFAULT_KEYCHAIN_SERVICE}
  --keychain-account <name>  Default: current OS user
  --username-keychain-service <name>  Default: ${DEFAULT_USERNAME_KEYCHAIN_SERVICE}
  --password-keychain-service <name>  Default: ${DEFAULT_PASSWORD_KEYCHAIN_SERVICE}
  --no-keychain              Do not read macOS Keychain
  --api-url <url>            API origin, default: ${DEFAULT_API_URL}
  --endpoint <url>           Full plugin install endpoint
  --version <version>        Optional plugin version
  --config <json>            Optional JSON config payload
  --config-file <path>       Optional JSON config file path
  --dry-run                  Print the request without sending it
  --help                     Show this help

Environment fallbacks:
  XPERT_API_URL, XPERT_TOKEN, XPERT_USERNAME, XPERT_PASSWORD
  XPERT_ORG_ID, XPERT_TENANT_ID, XPERT_SCOPE
  XPERT_KEYCHAIN_SERVICE, XPERT_KEYCHAIN_ACCOUNT
  XPERT_USERNAME_KEYCHAIN_SERVICE, XPERT_PASSWORD_KEYCHAIN_SERVICE

Store login credentials in macOS Keychain so every installation obtains a fresh JWT:
  security add-generic-password -a "$USER" -s ${DEFAULT_USERNAME_KEYCHAIN_SERVICE} -U -w "<xpert-username>"
  security add-generic-password -a "<xpert-username>" -s ${DEFAULT_PASSWORD_KEYCHAIN_SERVICE} -U -w
`)
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2), { booleanFlags: BOOLEAN_FLAGS })
  if (args.help) {
    printUsage()
    return
  }
  if (args.mode) {
    throw new Error('The --mode option has been removed. Local code installs always use copy mode.')
  }

  const { pluginName, workspacePath } = resolvePluginInput(args)
  const config = parsePluginConfig(args)
  const authentication = await requireAuthentication(args, { dryRun: args.dryRun })
  const headers = createRequestHeaders(args, authentication?.token ?? 'dry-run-token', authentication?.tenantId)
  const endpoint = resolvePluginEndpoint(args)
  const body = {
    pluginName,
    source: 'code',
    sourceConfig: { workspacePath }
  }
  if (args.version) {
    body.version = args.version
  }
  if (config !== undefined) {
    body.config = config
  }

  console.log('[plugin:install:local] Authentication source:', authentication?.source ?? 'dry-run only')
  console.log('[plugin:install:local] Endpoint:', endpoint)
  console.log('[plugin:install:local] Headers:', JSON.stringify(redactRequestHeaders(headers), null, 2))
  console.log(
    '[plugin:install:local] Request:',
    JSON.stringify(
      {
        pluginName,
        source: body.source,
        sourceConfig: body.sourceConfig,
        ...(args.version ? { version: args.version } : {}),
        hasConfig: config !== undefined
      },
      null,
      2
    )
  )
  if (args.dryRun) {
    console.log('[plugin:install:local] Dry run only. Request was not sent.')
    return
  }

  const response = await postJson(endpoint, headers, body)
  assertResponseOk('Plugin install', response)
  console.log(`[plugin:install:local] ${pluginName} installed successfully (HTTP ${response.status}).`)
  const summary = summarizePluginResponse(response.body)
  if (summary) {
    console.log('[plugin:install:local] Result:', JSON.stringify(summary, null, 2))
  }
}

main().catch((error) => handleCliError('plugin:install:local', error))
