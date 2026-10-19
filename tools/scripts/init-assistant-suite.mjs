#!/usr/bin/env node

import { runSuite } from './assistant-suite/run.mjs'
import { readSuiteProfile, normalizeRunId, resolveApiRoot } from './assistant-suite/profile.mjs'
import process from 'node:process'
import {
  DEFAULT_API_URL,
  DEFAULT_PASSWORD_KEYCHAIN_SERVICE,
  DEFAULT_USERNAME_KEYCHAIN_SERVICE,
  LocalPluginCliError,
  createRequestHeaders,
  handleCliError,
  parseCliArgs,
  requireAuthentication
} from './local-plugin-cli.mjs'

const BOOLEAN_FLAGS = ['dryRun', 'help', 'noKeychain', 'refresh', 'resume']

function printUsage() {
  console.log(`Install and publish a versioned Assistant suite from official plugin templates.

Usage:
  corepack pnpm assistant:suite:init --profile <file> --workspace-id <id> --org-id <id> [options]

Required options:
  --profile <path>           Versioned Assistant suite profile
  --workspace-id <id>       Organization workspace that will own the Assistants
  --org-id <id>             Organization installation scope

Suite options:
  --run-id <value>          Unique suffix for the installation batch; defaults to a UTC timestamp
  --resume                  Resume an exact prior run after template provenance validation
  --refresh                 Update every exact existing Assistant from its template, then rebind and republish the suite
  --environment-id <id>     Main Assistant environment; omitted preserves existing binding
  --release-notes <text>    Publication note for the Orchestrator
  --manifest-file <path>    Durable release receipt (required for refresh/resume)
  --installation-file <path> Existing installation receipt used to select exact Assistant IDs

API and authentication options:
  --api-url <url>            API origin, default: ${DEFAULT_API_URL}
  --token <jwt>              Bearer token; environment or Keychain is safer
  --username <identifier>    Xpert email or username; Keychain is preferred
  --password <password>      Xpert password; prefer Keychain or process environment
  --tenant-id <id>           Optional tenant identifier for organization requests
  --no-keychain              Do not read macOS Keychain

Other options:
  --dry-run                  Validate and print the local plan without API mutations
  --help                     Show this help

Environment fallbacks:
  XPERT_API_URL, XPERT_TOKEN, XPERT_USERNAME, XPERT_PASSWORD
  XPERT_ORG_ID, XPERT_TENANT_ID, XPERT_ASSISTANT_SUITE_MANIFEST
  XPERT_USERNAME_KEYCHAIN_SERVICE, XPERT_PASSWORD_KEYCHAIN_SERVICE

Store login credentials in macOS Keychain:
  security add-generic-password -a "$USER" -s ${DEFAULT_USERNAME_KEYCHAIN_SERVICE} -U -w "<xpert-username>"
  security add-generic-password -a "<xpert-username>" -s ${DEFAULT_PASSWORD_KEYCHAIN_SERVICE} -U -w
`)
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2), { booleanFlags: BOOLEAN_FLAGS })
  if (args.help) return printUsage()
  const { profile } = readSuiteProfile(args.profile)
  const workspaceId = args.workspaceId
  const organizationId = args.orgId || process.env.XPERT_ORG_ID
  if (!workspaceId || !organizationId) throw new LocalPluginCliError('--workspace-id and --org-id are required.')
  args.manifestFile ||= process.env.XPERT_ASSISTANT_SUITE_MANIFEST
  if ((args.refresh || args.resume) && !args.manifestFile) {
    throw new LocalPluginCliError('--manifest-file is required for refresh/resume.')
  }
  if (args.refresh && !args.runId && !args.installationFile && !args.resume) {
    throw new LocalPluginCliError('--refresh requires --installation-file or the exact original --run-id.')
  }
  if (args.installationFile && !args.refresh && !args.resume) {
    throw new LocalPluginCliError('--installation-file requires --refresh.')
  }
  const runId = normalizeRunId(args.runId)
  console.log('[assistant:suite:init] Scope: organization')
  console.log('[assistant:suite:init] Environment:', args.environmentId || 'preserve existing / null for new')
  console.log(
    '[assistant:suite:init] Existing instance policy:',
    args.resume ? 'resume recorded release' : args.refresh ? 'refresh exact existing batch' : 'create only'
  )
  if (args.dryRun) {
    console.log('[assistant:suite:init] Dry run only. No API request was sent.')
    return
  }
  const authentication = await requireAuthentication(args)
  const headers = createRequestHeaders(
    { ...args, orgId: organizationId, scope: 'organization' },
    authentication.token,
    authentication.tenantId
  )
  await runSuite({ args, profile, runId, workspaceId, organizationId, headers, apiRoot: resolveApiRoot(args) })
}

main().catch((error) => handleCliError('assistant:suite:init', error))
