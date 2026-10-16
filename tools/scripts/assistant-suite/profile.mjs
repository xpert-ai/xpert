import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_API_URL, LocalPluginCliError, getJson, assertResponseOk } from '../local-plugin-cli.mjs'

/** Returns a short stable batch suffix while retaining enough entropy for parallel local runs. */
export function defaultRunId() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
    .toLowerCase()
}

/** Normalizes a user-controlled batch suffix before it becomes part of an Assistant name. */
export function normalizeRunId(value) {
  const runId = String(value || defaultRunId())
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!runId) throw new LocalPluginCliError('The resolved --run-id is empty.')
  return runId.slice(0, 48)
}

/** Reads and validates the portable Assistant suite profile before any API request is made. */
export function readSuiteProfile(file) {
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
  if (roleKeys.has(profile.orchestrator.key))
    throw new LocalPluginCliError('The orchestrator key must differ from every role key.')
  if (!Array.isArray(profile.orchestrator.externalRoleKeys) || !profile.orchestrator.externalRoleKeys.length) {
    throw new LocalPluginCliError('orchestrator.externalRoleKeys must contain at least one role key.')
  }
  for (const definition of [...profile.roles, profile.orchestrator]) {
    if (definition.externalRoleKeys !== undefined && !Array.isArray(definition.externalRoleKeys))
      throw new LocalPluginCliError(`${definition.key}.externalRoleKeys must be an array.`)
    const externalRoleKeys = new Set()
    for (const key of definition.externalRoleKeys ?? []) {
      if (!roleKeys.has(key)) throw new LocalPluginCliError(`${definition.key} references unknown role key: ${key}`)
      if (externalRoleKeys.has(key)) throw new LocalPluginCliError(`Duplicate external role key: ${key}`)
      externalRoleKeys.add(key)
    }
  }
  roleDependencyOrder(profile)
  return { profile, profilePath }
}

/** Children publish before their callers, so embedded external descriptors always use the completed graph. */
export function roleDependencyOrder(profile) {
  const ordered = [],
    visiting = new Set(),
    visited = new Set()
  const visit = (definition) => {
    if (visiting.has(definition.key)) throw new LocalPluginCliError(`External role dependency cycle: ${definition.key}`)
    if (visited.has(definition.key)) return
    visiting.add(definition.key)
    for (const key of definition.externalRoleKeys ?? []) visit(profile.roles.find((role) => role.key === key))
    visiting.delete(definition.key)
    visited.add(definition.key)
    ordered.push(definition)
  }
  profile.roles.forEach(visit)
  return ordered
}

/** Validates the stable template and Agent identity needed for safe installation or resume. */
export function validateAssistantDefinition(definition, label) {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    throw new LocalPluginCliError(`${label} must be an object.`)
  }
  for (const field of ['key', 'templateKey', 'name', 'title', 'primaryAgentKey']) {
    assertText(definition[field], `${label}.${field}`)
  }
}

/** Requires a non-empty string field in a profile. */
export function assertText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new LocalPluginCliError(`${label} is required.`)
}

/** Resolves the common API prefix used by template and Xpert authoring endpoints. */
export function resolveApiRoot(args) {
  const input = (args.apiUrl || process.env.XPERT_API_URL || DEFAULT_API_URL).replace(/\/+$/, '')
  if (input.endsWith('/api/plugin')) return input.slice(0, -'/plugin'.length)
  if (input.endsWith('/api')) return input
  return `${input}/api`
}

/** Creates a canonical plugin template id from portable plugin and template keys. */
export function templateId(profile, definition) {
  return `${profile.plugin.name}:${definition.templateKey}`
}

/** Produces a fresh name for one installation batch without changing the reusable template identity. */
export function installedName(definition, runId) {
  return `${definition.name}-${runId}`
}

/** Produces a human title that makes parallel acceptance Assistants distinguishable. */
export function installedTitle(definition, runId) {
  return `${definition.title} ${runId}`
}

/** Fetches an exact name match in the target workspace for collision detection and explicit resume. */
export async function findByName(apiRoot, headers, workspaceId, name) {
  const data = encodeURIComponent(JSON.stringify({ where: { name, latest: true }, take: 10 }))
  const response = await getJson(
    `${apiRoot}/xpert/by-workspace/${encodeURIComponent(workspaceId)}?data=${data}`,
    headers
  )
  assertResponseOk('Assistant lookup', response)
  const items = Array.isArray(response.body?.items) ? response.body.items : []
  const matches = items.filter((item) => item?.name === name && item.latest !== false)
  if (matches.length > 1)
    throw new LocalPluginCliError(`Multiple current Assistants match ${name}; refusing an ambiguous update.`)
  return matches[0] ?? null
}

/** Loads the complete draft and published graph used for provenance and connection validation. */
export async function getTeam(apiRoot, headers, xpertId) {
  const response = await getJson(`${apiRoot}/xpert/${encodeURIComponent(xpertId)}/team`, headers)
  assertResponseOk('Assistant graph lookup', response)
  return response.body
}

/** Extracts canonical template provenance from draft or published options. */
export function readTemplateSource(xpert) {
  return xpert?.draft?.team?.options?.templateSource ?? xpert?.options?.templateSource ?? null
}

/** Resolves the primary Agent key from the current draft or published Assistant. */
export function readPrimaryAgentKey(xpert) {
  const graph = Array.isArray(xpert?.draft?.nodes) ? xpert.draft : xpert?.graph
  if (Array.isArray(graph?.nodes)) {
    const rootAgents = graph.nodes.filter((node) => node?.type === 'agent' && node?.entity?.leaderKey == null)
    return rootAgents.length === 1 ? (rootAgents[0]?.entity?.key ?? rootAgents[0]?.key ?? null) : null
  }
  const direct = xpert?.draft?.team?.agent?.key ?? xpert?.agent?.key
  if (direct) return direct
  const configured = Object.keys(xpert?.options?.agent ?? {})
  return configured.length === 1 ? configured[0] : null
}

/** Prevents a resume from adopting an unrelated Assistant with a colliding name. */
export function assertAssistantIdentity(xpert, profile, definition) {
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
