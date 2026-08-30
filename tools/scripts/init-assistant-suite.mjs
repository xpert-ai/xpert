#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  DEFAULT_API_URL,
  DEFAULT_PASSWORD_KEYCHAIN_SERVICE,
  DEFAULT_USERNAME_KEYCHAIN_SERVICE,
  LocalPluginCliError,
  assertResponseOk,
  createRequestHeaders,
  getJson,
  handleCliError,
  parseCliArgs,
  postJson,
  requireAuthentication
} from './local-plugin-cli.mjs'

const BOOLEAN_FLAGS = ['dryRun', 'help', 'noKeychain', 'resume']

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
  --environment-id <id>     Publish environment; omitted means null
  --release-notes <text>    Publication note for the Orchestrator
  --manifest-file <path>    Write the secret-free provisioning receipt

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

/** Returns a short stable batch suffix while retaining enough entropy for parallel local runs. */
function defaultRunId() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
    .toLowerCase()
}

/** Normalizes a user-controlled batch suffix before it becomes part of an Assistant name. */
function normalizeRunId(value) {
  const runId = String(value || defaultRunId())
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!runId) throw new LocalPluginCliError('The resolved --run-id is empty.')
  return runId.slice(0, 48)
}

/** Reads and validates the portable Assistant suite profile before any API request is made. */
function readSuiteProfile(file) {
  if (!file) throw new LocalPluginCliError('--profile <path> is required.')
  const profilePath = path.resolve(file)
  if (!fs.existsSync(profilePath)) throw new LocalPluginCliError(`Assistant suite profile not found: ${profilePath}`)
  let profile
  try {
    profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'))
  } catch (error) {
    throw new LocalPluginCliError(
      `Failed to parse ${profilePath}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new LocalPluginCliError('Assistant suite profile must be a JSON object.')
  }
  if (profile.schemaVersion !== 'xpert-assistant-suite@1') {
    throw new LocalPluginCliError('Assistant suite profile schemaVersion must be xpert-assistant-suite@1.')
  }
  assertText(profile.key, 'profile.key')
  assertText(profile.plugin?.name, 'profile.plugin.name')
  if (!Array.isArray(profile.roles) || !profile.roles.length) {
    throw new LocalPluginCliError('profile.roles must contain at least one role Assistant.')
  }
  const roleKeys = new Set()
  for (const role of profile.roles) {
    validateAssistantDefinition(role, `role ${role?.key ?? '<unknown>'}`)
    if (roleKeys.has(role.key)) throw new LocalPluginCliError(`Duplicate role key: ${role.key}`)
    roleKeys.add(role.key)
  }
  validateAssistantDefinition(profile.orchestrator, 'orchestrator')
  if (!Array.isArray(profile.orchestrator.externalRoleKeys) || !profile.orchestrator.externalRoleKeys.length) {
    throw new LocalPluginCliError('orchestrator.externalRoleKeys must contain at least one role key.')
  }
  const externalRoleKeys = new Set()
  for (const key of profile.orchestrator.externalRoleKeys) {
    if (!roleKeys.has(key)) throw new LocalPluginCliError(`Orchestrator references unknown role key: ${key}`)
    if (externalRoleKeys.has(key)) throw new LocalPluginCliError(`Duplicate external role key: ${key}`)
    externalRoleKeys.add(key)
  }
  return { profile, profilePath }
}

/** Validates the stable template and Agent identity needed for safe installation or resume. */
function validateAssistantDefinition(definition, label) {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    throw new LocalPluginCliError(`${label} must be an object.`)
  }
  for (const field of ['key', 'templateKey', 'name', 'title', 'primaryAgentKey']) {
    assertText(definition[field], `${label}.${field}`)
  }
}

/** Requires a non-empty string field in a profile. */
function assertText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new LocalPluginCliError(`${label} is required.`)
}

/** Resolves the common API prefix used by template and Xpert authoring endpoints. */
function resolveApiRoot(args) {
  const input = (args.apiUrl || process.env.XPERT_API_URL || DEFAULT_API_URL).replace(/\/+$/, '')
  if (input.endsWith('/api/plugin')) return input.slice(0, -'/plugin'.length)
  if (input.endsWith('/api')) return input
  return `${input}/api`
}

/** Creates a canonical plugin template id from portable plugin and template keys. */
function templateId(profile, definition) {
  return `${profile.plugin.name}:${definition.templateKey}`
}

/** Produces a fresh name for one installation batch without changing the reusable template identity. */
function installedName(definition, runId) {
  return `${definition.name}-${runId}`
}

/** Produces a human title that makes parallel acceptance Assistants distinguishable. */
function installedTitle(definition, runId) {
  return `${definition.title} ${runId}`
}

/** Fetches an exact name match in the target workspace for collision detection and explicit resume. */
async function findByName(apiRoot, headers, workspaceId, name) {
  const data = encodeURIComponent(JSON.stringify({ where: { name }, take: 10 }))
  const response = await getJson(
    `${apiRoot}/xpert/by-workspace/${encodeURIComponent(workspaceId)}?data=${data}`,
    headers
  )
  assertResponseOk('Assistant lookup', response)
  const items = Array.isArray(response.body?.items) ? response.body.items : []
  return items.find((item) => item?.name === name) ?? null
}

/** Loads the complete draft and published graph used for provenance and connection validation. */
async function getTeam(apiRoot, headers, xpertId) {
  const response = await getJson(`${apiRoot}/xpert/${encodeURIComponent(xpertId)}/team`, headers)
  assertResponseOk('Assistant graph lookup', response)
  return response.body
}

/** Extracts canonical template provenance from draft or published options. */
function readTemplateSource(xpert) {
  return xpert?.draft?.team?.options?.templateSource ?? xpert?.options?.templateSource ?? null
}

/** Resolves the primary Agent key from the current draft or published Assistant. */
function readPrimaryAgentKey(xpert) {
  return xpert?.draft?.team?.agent?.key ?? xpert?.agent?.key ?? null
}

/** Prevents a resume from adopting an unrelated Assistant with a colliding name. */
function assertAssistantIdentity(xpert, profile, definition) {
  const source = readTemplateSource(xpert)
  if (
    source?.pluginName !== profile.plugin.name ||
    source?.templateKey !== definition.templateKey ||
    readPrimaryAgentKey(xpert) !== definition.primaryAgentKey
  ) {
    throw new LocalPluginCliError(
      `Existing Assistant ${xpert?.name ?? '<unknown>'} does not match official template ${templateId(profile, definition)} and primary Agent ${definition.primaryAgentKey}.`
    )
  }
}

/** Publishes one draft while using null when no default or explicit environment exists. */
async function publishAssistant(apiRoot, headers, xpertId, environmentId, releaseNotes) {
  const response = await postJson(`${apiRoot}/xpert/${encodeURIComponent(xpertId)}/publish?newVersion=false`, headers, {
    environmentId: environmentId || null,
    releaseNotes
  })
  assertResponseOk('Assistant publication', response)
  return response.body
}

/** Installs or explicitly resumes one role Assistant without silently overwriting an existing instance. */
async function installRole({ apiRoot, definition, headers, profile, resume, runId, workspaceId }) {
  const name = installedName(definition, runId)
  const existing = await findByName(apiRoot, headers, workspaceId, name)
  if (existing && !resume) {
    throw new LocalPluginCliError(
      `Assistant ${name} already exists. Use a new --run-id or pass --resume after inspection.`
    )
  }
  if (existing) {
    const team = await getTeam(apiRoot, headers, existing.id)
    assertAssistantIdentity(team, profile, definition)
    if (!team.version) {
      return publishAssistant(apiRoot, headers, team.id, null, `Resumed ${profile.key}`)
    }
    return team
  }

  const response = await postJson(
    `${apiRoot}/xpert-template/${encodeURIComponent(templateId(profile, definition))}/install`,
    headers,
    {
      workspaceId,
      publish: true,
      basic: {
        name,
        title: installedTitle(definition, runId)
      }
    }
  )
  assertResponseOk(`Install role ${definition.key}`, response)
  const xpert = response.body?.xpert
  if (!xpert?.id) throw new LocalPluginCliError(`Template installation for role ${definition.key} returned no Xpert.`)
  const team = await getTeam(apiRoot, headers, xpert.id)
  assertAssistantIdentity(team, profile, definition)
  return team
}

/** Installs a draft Orchestrator or resumes only the exact batch requested by the caller. */
async function installOrchestratorDraft({ apiRoot, headers, profile, resume, runId, workspaceId }) {
  const definition = profile.orchestrator
  const name = installedName(definition, runId)
  const existing = await findByName(apiRoot, headers, workspaceId, name)
  if (existing && !resume) {
    throw new LocalPluginCliError(
      `Assistant ${name} already exists. Use a new --run-id or pass --resume after inspection.`
    )
  }
  if (existing) {
    const team = await getTeam(apiRoot, headers, existing.id)
    assertAssistantIdentity(team, profile, definition)
    return team
  }

  const response = await postJson(
    `${apiRoot}/xpert-template/${encodeURIComponent(templateId(profile, definition))}/install`,
    headers,
    {
      workspaceId,
      publish: false,
      basic: {
        name,
        title: installedTitle(definition, runId)
      }
    }
  )
  assertResponseOk('Install Orchestrator draft', response)
  const xpert = response.body?.xpert
  if (!xpert?.id) throw new LocalPluginCliError('Orchestrator template installation returned no Xpert.')
  const team = await getTeam(apiRoot, headers, xpert.id)
  assertAssistantIdentity(team, profile, definition)
  return team
}

/** Adds the exact role instances as direct required external Xperts and rejects ambiguous pre-existing bindings. */
function connectExternalRoles(orchestrator, profile, rolesByKey) {
  const draft = orchestrator?.draft
  if (!draft?.team || !Array.isArray(draft.nodes) || !Array.isArray(draft.connections)) {
    throw new LocalPluginCliError('Orchestrator draft graph is unavailable.')
  }
  const from = profile.orchestrator.primaryAgentKey
  const nodes = [...draft.nodes]
  const connections = draft.connections.map((connection) => ({ ...connection }))

  profile.orchestrator.externalRoleKeys.forEach((roleKey, index) => {
    const role = rolesByKey.get(roleKey)
    if (!role?.id) throw new LocalPluginCliError(`Installed role ${roleKey} has no Xpert id.`)
    const roleDefinition = profile.roles.find((item) => item.key === roleKey)
    const sameTemplateNodes = nodes.filter(
      (node) => node.type === 'xpert' && readTemplateSource(node.entity)?.templateKey === roleDefinition.templateKey
    )
    if (sameTemplateNodes.some((node) => node.key !== role.id)) {
      throw new LocalPluginCliError(`Orchestrator already contains another external Xpert for role ${roleKey}.`)
    }
    if (!nodes.some((node) => node.type === 'xpert' && node.key === role.id)) {
      nodes.push({
        key: role.id,
        type: 'xpert',
        position: { x: 180 + index * 280, y: 360 },
        entity: role
      })
    }
    const sameConnection = connections.find(
      (connection) => connection.type === 'xpert' && connection.from === from && connection.to === role.id
    )
    if (sameConnection) {
      sameConnection.required = true
    } else {
      connections.push({
        key: `${from}/${role.id}`,
        type: 'xpert',
        from,
        to: role.id,
        required: true
      })
    }
  })

  return { ...draft, nodes, connections }
}

/** Verifies the published graph contains one direct required connection for every configured role. */
function verifyPublishedSuite(orchestrator, profile, rolesByKey) {
  const graph = orchestrator?.graph
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.connections)) {
    throw new LocalPluginCliError('Published Orchestrator graph is unavailable.')
  }
  const from = profile.orchestrator.primaryAgentKey
  for (const roleKey of profile.orchestrator.externalRoleKeys) {
    const role = rolesByKey.get(roleKey)
    const matches = graph.connections.filter(
      (connection) =>
        connection.type === 'xpert' &&
        connection.from === from &&
        connection.to === role.id &&
        connection.required === true
    )
    if (matches.length !== 1) {
      throw new LocalPluginCliError(`Published Orchestrator must have exactly one required connection for ${roleKey}.`)
    }
  }
}

/** Writes a local receipt; IDs are operational references and are never embedded into reusable templates. */
function writeManifest(file, manifest) {
  if (!file) return
  const outputPath = path.resolve(file)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log('[assistant:suite:init] Provisioning manifest:', outputPath)
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2), { booleanFlags: BOOLEAN_FLAGS })
  if (args.help) {
    printUsage()
    return
  }
  const { profile, profilePath } = readSuiteProfile(args.profile)
  const workspaceId = args.workspaceId
  const organizationId = args.orgId || process.env.XPERT_ORG_ID
  if (!workspaceId) throw new LocalPluginCliError('--workspace-id <id> is required.')
  if (!organizationId) throw new LocalPluginCliError('--org-id <id> or XPERT_ORG_ID is required.')
  const runId = normalizeRunId(args.runId)
  const authentication = await requireAuthentication(args, { dryRun: args.dryRun })
  const headers = createRequestHeaders(
    { ...args, orgId: organizationId, scope: 'organization' },
    authentication?.token ?? 'dry-run-token',
    authentication?.tenantId
  )
  const apiRoot = resolveApiRoot(args)
  const environmentId = args.environmentId || null

  console.log('[assistant:suite:init] Profile:', profile.key)
  console.log('[assistant:suite:init] Profile file:', profilePath)
  console.log('[assistant:suite:init] Run id:', runId)
  console.log('[assistant:suite:init] Scope: organization')
  console.log('[assistant:suite:init] Organization:', organizationId)
  console.log('[assistant:suite:init] Workspace:', workspaceId)
  console.log('[assistant:suite:init] Environment:', environmentId)
  console.log('[assistant:suite:init] Existing instance policy:', args.resume ? 'resume exact batch' : 'create only')
  if (args.dryRun) {
    console.log('[assistant:suite:init] Dry run only. No API request was sent.')
    return
  }

  const pluginEndpoint = `${apiRoot}/plugin`
  const pluginResponse = await postJson(`${pluginEndpoint}/by-names`, headers, { names: [profile.plugin.name] })
  assertResponseOk('Suite plugin verification', pluginResponse)
  const pluginDescriptor = Array.isArray(pluginResponse.body)
    ? pluginResponse.body[0]
    : Array.isArray(pluginResponse.body?.items)
      ? pluginResponse.body.items[0]
      : null
  if (!pluginDescriptor) throw new LocalPluginCliError(`Plugin ${profile.plugin.name} is not loaded in this scope.`)
  if (profile.plugin.version && pluginDescriptor.version !== profile.plugin.version) {
    throw new LocalPluginCliError(
      `Plugin ${profile.plugin.name} version ${pluginDescriptor.version ?? '<unknown>'} does not match profile version ${profile.plugin.version}.`
    )
  }

  const allDefinitions = [...profile.roles, profile.orchestrator]
  await Promise.all(
    allDefinitions.map(async (definition) => {
      const response = await getJson(
        `${apiRoot}/xpert-template/${encodeURIComponent(templateId(profile, definition))}`,
        headers
      )
      assertResponseOk(`Template preflight ${definition.key}`, response)
      if (response.body?.pluginName !== profile.plugin.name || response.body?.key !== definition.templateKey) {
        throw new LocalPluginCliError(`Template preflight mismatch for ${definition.key}.`)
      }
    })
  )

  const roleEntries = await Promise.all(
    profile.roles.map(async (definition) => {
      const role = await installRole({
        apiRoot,
        definition,
        headers,
        profile,
        resume: args.resume === true,
        runId,
        workspaceId
      })
      return [definition.key, role]
    })
  )
  const rolesByKey = new Map(roleEntries)
  for (const [roleKey, role] of roleEntries) {
    console.log(`[assistant:suite:init] Role ready: ${roleKey} (${role.name})`)
  }

  const orchestratorDraft = await installOrchestratorDraft({
    apiRoot,
    headers,
    profile,
    resume: args.resume === true,
    runId,
    workspaceId
  })
  const draft = connectExternalRoles(orchestratorDraft, profile, rolesByKey)
  const saveResponse = await postJson(
    `${apiRoot}/xpert/${encodeURIComponent(orchestratorDraft.id)}/draft`,
    headers,
    draft
  )
  assertResponseOk('Save Orchestrator external Xpert graph', saveResponse)
  await publishAssistant(
    apiRoot,
    headers,
    orchestratorDraft.id,
    environmentId,
    args.releaseNotes || `Installed Assistant suite ${profile.key}`
  )
  const published = await getTeam(apiRoot, headers, orchestratorDraft.id)
  assertAssistantIdentity(published, profile, profile.orchestrator)
  verifyPublishedSuite(published, profile, rolesByKey)

  const manifestFile = args.manifestFile || process.env.XPERT_ASSISTANT_SUITE_MANIFEST
  writeManifest(manifestFile, {
    schemaVersion: 'xpert-assistant-suite-installation@1',
    generatedAt: new Date().toISOString(),
    profile: profile.key,
    runId,
    plugin: { name: profile.plugin.name, version: pluginDescriptor.version ?? null },
    scope: { tenantId: headers['tenant-id'] ?? null, organizationId, workspaceId, environmentId },
    orchestrator: {
      id: published.id,
      name: published.name,
      title: published.title,
      version: published.version ?? null,
      primaryAgentKey: readPrimaryAgentKey(published),
      requiredExternalConnections: profile.orchestrator.externalRoleKeys.length
    },
    roles: profile.roles.map((definition) => {
      const role = rolesByKey.get(definition.key)
      return {
        key: definition.key,
        id: role.id,
        name: role.name,
        title: role.title,
        version: role.version ?? null,
        templateKey: definition.templateKey,
        primaryAgentKey: readPrimaryAgentKey(role)
      }
    }),
    readyForTesting: true
  })
  console.log(`[assistant:suite:init] ${profile.key} is published and ready for testing.`)
}

main().catch((error) => handleCliError('assistant:suite:init', error))
