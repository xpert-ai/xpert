import { roleDependencyOrder } from '../../../packages/server-ai/src/plugin-resource/application-update/engine/profile.cjs'
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

export {
  roleDependencyOrder,
  templateId,
  installedName,
  installedTitle,
  readTemplateSource,
  readPrimaryAgentKey,
  assertAssistantIdentity
} from '../../../packages/server-ai/src/plugin-resource/application-update/engine/profile.cjs'
