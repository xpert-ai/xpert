// Invariants: preflight the entire suite before mutation, prepare drafts before publishing,
// publish children before callers, and checkpoint each request for explicit recovery.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { LocalPluginCliError, assertResponseOk, getJson, postJson } from '../local-plugin-cli.mjs'
import {
  assertAssistantIdentity,
  findByName,
  installedName,
  installedTitle,
  roleDependencyOrder,
  templateId
} from './profile.mjs'
import { graphHash, hash, lockReceipt, modelHash, readReceipt, saveReceipt, stateHash } from './state.mjs'
import { connectRoles, verifyRoles } from './graph.mjs'

export async function runSuite(context) {
  const { args, profile, workspaceId, organizationId, headers, apiRoot } = context
  const file = path.resolve(
    args.manifestFile || path.join(os.homedir(), '.xpert', 'assistant-suites', `${context.runId}.json`)
  )
  const releaseLock = lockReceipt(file)
  let receipt
  let ownsReceipt = false
  const save = () => saveReceipt(file, receipt)
  const request = async (method, url, body) => {
    const response = await (method === 'GET'
      ? getJson(`${apiRoot}${url}`, headers)
      : postJson(`${apiRoot}${url}`, headers, body))
    assertResponseOk('Assistant suite API', response)
    return response.body
  }
  const load = async (id, definition) => {
    // /team may omit the select:false draft; the authoring endpoint is authoritative.
    const live = await request('GET', `/xpert/${encodeURIComponent(id)}`)
    const team = await request('GET', `/xpert/${encodeURIComponent(id)}/team`)
    if (live.id !== id || team.id !== id || live.workspaceId !== workspaceId || live.latest === false) {
      throw new LocalPluginCliError('Assistant identity/workspace does not match the release target.')
    }
    const result = { ...team, ...live, graph: team.graph, draft: live.draft ?? null }
    assertAssistantIdentity(result, profile, definition)
    return result
  }
  try {
    const scope = { tenantId: headers['tenant-id'] ?? null, organizationId, workspaceId }
    const signature = hash({ apiRoot, scope, profile })
    if (args.resume) {
      receipt = readReceipt(file)
      if (
        receipt.schemaVersion !== 'xpert-assistant-suite-release@1' ||
        receipt.signature !== signature ||
        (args.runId && args.runId !== receipt.runId) ||
        (args.refresh && receipt.mode !== 'refresh')
      ) {
        throw new LocalPluginCliError('Resume scope, profile or run does not match the recorded release.')
      }
      if (args.environmentId !== undefined && args.environmentId !== receipt.environmentOverride) {
        throw new LocalPluginCliError('Resume cannot change the recorded environment.')
      }
    } else if (fs.existsSync(file)) {
      throw new LocalPluginCliError('Release receipt already exists. Use --resume or a new --manifest-file.')
    }

    const descriptors = await request('POST', '/plugin/by-names', { names: [profile.plugin.name] })
    const plugin = (Array.isArray(descriptors) ? descriptors : descriptors.items)?.find(
      (item) => item.name === profile.plugin.name || item.packageName === profile.plugin.name
    )
    if (
      !plugin ||
      plugin.pendingRestart ||
      plugin.restartRequired ||
      (plugin.loadStatus && plugin.loadStatus !== 'loaded') ||
      (profile.plugin.version && plugin.version !== profile.plugin.version)
    ) {
      throw new LocalPluginCliError('Expected plugin version is not ready in this scope.')
    }
    const definitions = [...profile.roles, profile.orchestrator]
    const templates = new Map()
    for (const definition of definitions) {
      const template = await request('GET', `/xpert-template/${encodeURIComponent(templateId(profile, definition))}`)
      if (
        template.pluginName !== profile.plugin.name ||
        (template.key !== templateId(profile, definition) && (template.name ?? template.key) !== definition.templateKey)
      ) {
        throw new LocalPluginCliError(`Template provenance mismatch: ${definition.key}.`)
      }
      templates.set(
        definition.key,
        hash({
          content: template.export_data,
          contentHash: template.contentHash,
          dependencies: template.dependencies,
          pluginVersion: template.pluginVersion
        })
      )
    }

    const teams = new Map()
    if (receipt) {
      if (
        receipt.plugin.version !== plugin.version ||
        definitions.some((item) => receipt.entries[item.key]?.templateHash !== templates.get(item.key))
      ) {
        throw new LocalPluginCliError(
          'Templates or plugin changed since this release. Refusing to resume a different release.'
        )
      }
      // Validate every recorded target before resuming any mutation.
      for (const definition of definitions) {
        const entry = receipt.entries[definition.key]
        if (!entry.id) continue
        const live = await load(entry.id, definition)
        if (!['publishing', 'preparing', 'binding'].includes(entry.stage) && stateHash(live) !== entry.stateHash) {
          throw new LocalPluginCliError(`Assistant ${definition.key} changed outside this release.`)
        }
        teams.set(definition.key, live)
      }
    } else {
      const installation = args.installationFile ? readReceipt(args.installationFile) : null
      if (
        installation &&
        (installation.scope?.organizationId !== organizationId ||
          installation.scope?.workspaceId !== workspaceId ||
          installation.scope?.tenantId !== scope.tenantId ||
          installation.plugin?.name !== profile.plugin.name)
      ) {
        throw new LocalPluginCliError('Installation receipt belongs to another scope or plugin.')
      }
      const prior = installation ? [...(installation.roles ?? []), installation.orchestrator].filter(Boolean) : []
      const entries = {}
      for (const definition of definitions) {
        const saved = prior.filter((item) => item.key === definition.key || item.templateKey === definition.templateKey)
        if (saved.length > 1) throw new LocalPluginCliError(`Ambiguous installation mapping: ${definition.key}.`)
        const match = installation
          ? saved[0]
          : await findByName(apiRoot, headers, workspaceId, installedName(definition, context.runId))
        if (match && !args.refresh)
          throw new LocalPluginCliError('Assistant already exists. Use --refresh for an intentional update.')
        if (!match && args.refresh) throw new LocalPluginCliError(`Existing Assistant ${definition.key} was not found.`)
        const live = match ? await load(match.id, definition) : null
        if (live?.options?.pendingPublication) {
          throw new LocalPluginCliError(
            `Assistant ${definition.key} has pending activation; resume its previous release first.`
          )
        }
        if (live) teams.set(definition.key, live)
        entries[definition.key] = {
          id: live?.id ?? null,
          stage: 'pending',
          versionBefore: live?.version ?? null,
          environmentId:
            definition.key === profile.orchestrator.key && args.environmentId !== undefined
              ? args.environmentId.trim() || null
              : (live?.environmentId ?? null),
          stateHash: live ? stateHash(live) : null,
          templateHash: templates.get(definition.key)
        }
      }
      if (
        new Set(
          Object.values(entries)
            .map((entry) => entry.id)
            .filter(Boolean)
        ).size !== teams.size
      )
        throw new LocalPluginCliError('Multiple roles resolve to the same Assistant.')
      receipt = {
        schemaVersion: 'xpert-assistant-suite-release@1',
        signature,
        runId: context.runId,
        profile: profile.key,
        mode: args.refresh ? 'refresh' : 'create',
        plugin: { name: profile.plugin.name, version: plugin.version },
        scope,
        environmentOverride: args.environmentId,
        entries,
        retiredIds: prior
          .filter((item) => !definitions.some((definition) => definition.templateKey === item.templateKey))
          .map((item) => item.id),
        readyForTesting: false,
        status: 'preparing'
      }
      save()
    }
    ownsReceipt = true
    console.log('[assistant:suite:init] Release receipt:', file)

    for (const definition of definitions) {
      const entry = receipt.entries[definition.key]
      if (['prepared', 'binding', 'publishing', 'published'].includes(entry.stage)) continue
      let live = teams.get(definition.key)
      if (entry.stage === 'preparing' && live && entry.preparingHash && stateHash(live) !== entry.preparingHash) {
        // Unknown outcomes must not overwrite a later edit without a matching checkpoint.
        throw new LocalPluginCliError(
          `Interrupted synchronization for ${definition.key} changed the draft; inspect it before starting another release.`
        )
      }
      entry.stage = 'preparing'
      entry.preparingHash = live ? stateHash(live) : null
      save()
      if (!live) {
        // Reconcile an installation whose HTTP response was lost using the exact unique run name and provenance.
        const existing = await findByName(apiRoot, headers, workspaceId, installedName(definition, receipt.runId))
        if (existing && args.resume) live = await load(existing.id, definition)
        else {
          if (existing) throw new LocalPluginCliError('Assistant appeared after preflight; refusing to adopt it.')
          const installed = await request(
            'POST',
            `/xpert-template/${encodeURIComponent(templateId(profile, definition))}/install`,
            {
              workspaceId,
              publish: false,
              basic: {
                name: installedName(definition, receipt.runId),
                title: installedTitle(definition, receipt.runId)
              }
            }
          )
          if (!installed.xpert?.id) throw new LocalPluginCliError('Template installation did not return an Assistant.')
          live = await load(installed.xpert.id, definition)
        }
      } else {
        const fresh = await load(entry.id, definition)
        if (stateHash(fresh) !== entry.preparingHash)
          throw new LocalPluginCliError(`Assistant ${definition.key} changed before synchronization.`)
        await request('POST', `/xpert/${encodeURIComponent(entry.id)}/sync-template`, {})
        live = await load(entry.id, definition)
      }
      entry.id = live.id
      entry.stage = 'prepared'
      entry.stateHash = stateHash(live)
      teams.set(definition.key, live)
      save()
    }

    // A plugin reload between preparation requests must never produce a mixed published suite.
    for (const definition of definitions) {
      const template = await request('GET', `/xpert-template/${encodeURIComponent(templateId(profile, definition))}`)
      if (
        hash({
          content: template.export_data,
          contentHash: template.contentHash,
          dependencies: template.dependencies,
          pluginVersion: template.pluginVersion
        }) !== templates.get(definition.key)
      ) {
        throw new LocalPluginCliError('Template changed during preparation; no further publication was attempted.')
      }
    }

    receipt.status = 'publishing'
    save()
    const published = new Map()
    for (const definition of [...roleDependencyOrder(profile), profile.orchestrator]) {
      const entry = receipt.entries[definition.key]
      let live = await load(entry.id, definition)
      if (entry.stage === 'binding') {
        if (live.draft && stateHash(live) === entry.bindingHash) {
          entry.stateHash = stateHash(live)
          entry.stage = 'publishing'
          save()
        } else if (stateHash(live) === entry.stateHash) {
          entry.stage = 'prepared'
        } else
          throw new LocalPluginCliError(`Interrupted binding for ${definition.key} conflicts with the current draft.`)
      }
      if (entry.stage === 'published') {
        if (stateHash(live) !== entry.stateHash)
          throw new LocalPluginCliError(`Published Assistant ${definition.key} changed.`)
      } else if (
        entry.stage === 'publishing' &&
        !live.draft &&
        live.version !== entry.versionBefore &&
        graphHash(live.graph) === entry.graphHash &&
        modelHash(live) === entry.modelHash &&
        (live.environmentId ?? null) === entry.environmentId
      ) {
        await request('POST', `/xpert/${encodeURIComponent(entry.id)}/publication/resume`, {
          version: String(live.version)
        })
        live = await load(entry.id, definition)
      } else {
        if (stateHash(live) !== entry.stateHash)
          throw new LocalPluginCliError(`Draft ${definition.key} changed before publication.`)
        if (entry.stage !== 'publishing') {
          const draft = connectRoles(live, definition, profile, published, receipt.retiredIds)
          entry.graphHash = graphHash(draft)
          entry.bindingHash = stateHash({ ...live, draft })
          entry.modelHash = modelHash({ ...live, draft })
          entry.stage = 'binding'
          save()
          await request('POST', `/xpert/${encodeURIComponent(entry.id)}/draft`, draft)
          live = await load(entry.id, definition)
          entry.stateHash = stateHash(live)
          entry.graphHash = graphHash(live.draft)
          entry.stage = 'publishing'
          save()
        }
        await request('POST', `/xpert/${encodeURIComponent(entry.id)}/publish?newVersion=true`, {
          environmentId: entry.environmentId,
          releaseNotes: args.releaseNotes || `${receipt.mode === 'refresh' ? 'Refreshed' : 'Installed'} ${profile.key}`
        })
        live = await load(entry.id, definition)
      }
      if (
        live.draft ||
        !live.version ||
        graphHash(live.graph) !== entry.graphHash ||
        modelHash(live) !== entry.modelHash ||
        (live.environmentId ?? null) !== entry.environmentId
      ) {
        throw new LocalPluginCliError(`Published state does not match the prepared release for ${definition.key}.`)
      }
      verifyRoles(live, definition, published)
      entry.stage = 'published'
      entry.version = live.version
      entry.stateHash = stateHash(live)
      published.set(definition.key, live)
      save()
      console.log(`[assistant:suite:init] Published: ${definition.key}`)
    }
    const summary = (definition) => ({
      key: definition.key,
      id: receipt.entries[definition.key].id,
      templateKey: definition.templateKey,
      primaryAgentKey: definition.primaryAgentKey,
      version: receipt.entries[definition.key].version,
      externalRoleKeys: definition.externalRoleKeys ?? [],
      requiredExternalConnections: definition.externalRoleKeys?.length ?? 0
    })
    receipt.roles = profile.roles.map(summary)
    receipt.orchestrator = summary(profile.orchestrator)
    receipt.status = 'completed'
    receipt.readyForTesting = true
    save()
    console.log(`[assistant:suite:init] ${profile.key} is published and ready for testing.`)
  } catch (error) {
    if (ownsReceipt) {
      receipt.status = 'failed'
      receipt.readyForTesting = false
      save()
    }
    throw error
  } finally {
    releaseLock()
  }
}
