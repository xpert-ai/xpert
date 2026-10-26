// Shared by the CLI and App control plane. Checkpoints precede every mutation;
// preflight the whole suite and publish dependencies before their callers.
const { SuiteReleaseError } = require('./error.cjs')
const {
    assertAssistantIdentity,
    installedName,
    installedTitle,
    roleDependencyOrder,
    templateId
} = require('./profile.cjs')
const { graphHash, hash, modelHash, stateHash } = require('./state.cjs')
const { connectRoles, verifyRoles } = require('./graph.cjs')

async function executeSuite(context) {
    const { args, profile, workspaceId, apiRoot, ports } = context
    const organizationId = context.scope.organizationId
    let receipt
    let ownsReceipt = false
    const save = () => context.save(receipt)
    const load = async (id, definition) => {
        const result = await ports.load(id)
        if (result.id !== id || result.workspaceId !== workspaceId || result.latest === false)
            throw new SuiteReleaseError('Assistant identity/workspace does not match the release target.')
        assertAssistantIdentity(result, profile, definition)
        return result
    }
    try {
        const scope = context.scope
        const signature = hash({ apiRoot, scope, profile })
        if (args.resume) {
            receipt = context.receipt
            if (
                receipt.schemaVersion !== 'xpert-assistant-suite-release@1' ||
                receipt.signature !== signature ||
                (args.runId && args.runId !== receipt.runId) ||
                (args.refresh && receipt.mode !== 'refresh')
            ) {
                throw new SuiteReleaseError('Resume scope, profile or run does not match the recorded release.')
            }
            if (args.environmentId !== undefined && args.environmentId !== receipt.environmentOverride) {
                throw new SuiteReleaseError('Resume cannot change the recorded environment.')
            }
        } else if (context.receipt) {
            throw new SuiteReleaseError('Release receipt already exists. Use --resume or a new --manifest-file.')
        }

        const descriptors = await ports.plugins(profile.plugin.name)
        const plugin = (Array.isArray(descriptors) ? descriptors : descriptors.items)?.find(
            (item) => item.name === profile.plugin.name || item.packageName === profile.plugin.name
        )
        const pluginVersion = plugin?.currentVersion ?? plugin?.version
        if (
            !plugin ||
            plugin.pendingRestart ||
            plugin.restartRequired ||
            (plugin.loadStatus && plugin.loadStatus !== 'loaded') ||
            (profile.plugin.version && pluginVersion !== profile.plugin.version)
        ) {
            throw new SuiteReleaseError('Expected plugin version is not ready in this scope.')
        }
        const definitions = [...profile.roles, profile.orchestrator]
        const templates = new Map()
        for (const definition of definitions) {
            const template = await ports.template(templateId(profile, definition))
            if (
                template.pluginName !== profile.plugin.name ||
                (template.key !== templateId(profile, definition) &&
                    (template.name ?? template.key) !== definition.templateKey)
            ) {
                throw new SuiteReleaseError(`Template provenance mismatch: ${definition.key}.`)
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
                receipt.plugin.version !== pluginVersion ||
                definitions.some((item) => receipt.entries[item.key]?.templateHash !== templates.get(item.key))
            ) {
                throw new SuiteReleaseError(
                    'Templates or plugin changed since this release. Refusing to resume a different release.'
                )
            }
            // Validate every recorded target before resuming any mutation.
            for (const definition of definitions) {
                const entry = receipt.entries[definition.key]
                if (!entry.id) continue
                const live = await load(entry.id, definition)
                if (
                    !['publishing', 'preparing', 'binding'].includes(entry.stage) &&
                    stateHash(live) !== entry.stateHash
                ) {
                    throw new SuiteReleaseError(`Assistant ${definition.key} changed outside this release.`)
                }
                teams.set(definition.key, live)
            }
        } else {
            const installation = context.installation ?? null
            if (
                installation &&
                (installation.scope?.organizationId !== organizationId ||
                    installation.scope?.workspaceId !== workspaceId ||
                    installation.scope?.tenantId !== scope.tenantId ||
                    installation.plugin?.name !== profile.plugin.name)
            ) {
                throw new SuiteReleaseError('Installation receipt belongs to another scope or plugin.')
            }
            const prior = installation ? [...(installation.roles ?? []), installation.orchestrator].filter(Boolean) : []
            const entries = {}
            for (const definition of definitions) {
                const saved = prior.filter(
                    (item) => item.key === definition.key || item.templateKey === definition.templateKey
                )
                if (saved.length > 1) throw new SuiteReleaseError(`Ambiguous installation mapping: ${definition.key}.`)
                const match = installation ? saved[0] : await ports.find(installedName(definition, context.runId))
                if (match && !args.refresh)
                    throw new SuiteReleaseError('Assistant already exists. Use --refresh for an intentional update.')
                if (!match && args.refresh)
                    throw new SuiteReleaseError(`Existing Assistant ${definition.key} was not found.`)
                const live = match ? await load(match.id, definition) : null
                if (live?.options?.pendingPublication) {
                    throw new SuiteReleaseError(
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
                throw new SuiteReleaseError('Multiple roles resolve to the same Assistant.')
            receipt = {
                schemaVersion: 'xpert-assistant-suite-release@1',
                signature,
                runId: context.runId,
                profile: profile.key,
                mode: args.refresh ? 'refresh' : 'create',
                plugin: { name: profile.plugin.name, version: pluginVersion },
                scope,
                environmentOverride: args.environmentId,
                entries,
                retiredIds: prior
                    .filter((item) => !definitions.some((definition) => definition.templateKey === item.templateKey))
                    .map((item) => item.id),
                readyForTesting: false,
                status: 'preparing'
            }
            await save()
        }
        ownsReceipt = true

        for (const definition of definitions) {
            const entry = receipt.entries[definition.key]
            if (['prepared', 'binding', 'publishing', 'published'].includes(entry.stage)) continue
            let live = teams.get(definition.key)
            if (entry.stage === 'preparing' && live && entry.preparingHash && stateHash(live) !== entry.preparingHash) {
                // Unknown outcomes must not overwrite a later edit without a matching checkpoint.
                throw new SuiteReleaseError(
                    `Interrupted synchronization for ${definition.key} changed the draft; inspect it before starting another release.`
                )
            }
            entry.stage = 'preparing'
            entry.preparingHash = live ? stateHash(live) : null
            await save()
            if (!live) {
                // Reconcile an installation whose HTTP response was lost using the exact unique run name and provenance.
                const existing = await ports.find(installedName(definition, receipt.runId))
                if (existing && args.resume) live = await load(existing.id, definition)
                else {
                    if (existing)
                        throw new SuiteReleaseError('Assistant appeared after preflight; refusing to adopt it.')
                    const installed = await ports.install(templateId(profile, definition), {
                        workspaceId,
                        publish: false,
                        basic: {
                            name: installedName(definition, receipt.runId),
                            title: installedTitle(definition, receipt.runId)
                        }
                    })
                    if (!installed.xpert?.id)
                        throw new SuiteReleaseError('Template installation did not return an Assistant.')
                    live = await load(installed.xpert.id, definition)
                }
            } else {
                const fresh = await load(entry.id, definition)
                if (stateHash(fresh) !== entry.preparingHash)
                    throw new SuiteReleaseError(`Assistant ${definition.key} changed before synchronization.`)
                await ports.sync(entry.id)
                live = await load(entry.id, definition)
            }
            entry.id = live.id
            entry.stage = 'prepared'
            entry.stateHash = stateHash(live)
            teams.set(definition.key, live)
            await save()
        }

        // A plugin reload between preparation requests must never produce a mixed published suite.
        for (const definition of definitions) {
            const template = await ports.template(templateId(profile, definition))
            if (
                hash({
                    content: template.export_data,
                    contentHash: template.contentHash,
                    dependencies: template.dependencies,
                    pluginVersion: template.pluginVersion
                }) !== templates.get(definition.key)
            ) {
                throw new SuiteReleaseError(
                    'Template changed during preparation; no further publication was attempted.'
                )
            }
        }

        receipt.status = 'publishing'
        await save()
        const published = new Map()
        for (const definition of [...roleDependencyOrder(profile), profile.orchestrator]) {
            const entry = receipt.entries[definition.key]
            let live = await load(entry.id, definition)
            if (entry.stage === 'binding') {
                if (live.draft && stateHash(live) === entry.bindingHash) {
                    entry.stateHash = stateHash(live)
                    entry.stage = 'publishing'
                    await save()
                } else if (stateHash(live) === entry.stateHash) {
                    entry.stage = 'prepared'
                } else
                    throw new SuiteReleaseError(
                        `Interrupted binding for ${definition.key} conflicts with the current draft.`
                    )
            }
            if (entry.stage === 'published') {
                if (stateHash(live) !== entry.stateHash)
                    throw new SuiteReleaseError(`Published Assistant ${definition.key} changed.`)
            } else if (
                entry.stage === 'publishing' &&
                !live.draft &&
                live.version !== entry.versionBefore &&
                graphHash(live.graph) === entry.graphHash &&
                modelHash(live) === entry.modelHash &&
                (live.environmentId ?? null) === entry.environmentId
            ) {
                await ports.resume(entry.id, String(live.version))
                live = await load(entry.id, definition)
            } else {
                if (stateHash(live) !== entry.stateHash)
                    throw new SuiteReleaseError(`Draft ${definition.key} changed before publication.`)
                if (entry.stage !== 'publishing') {
                    const draft = connectRoles(live, definition, profile, published, receipt.retiredIds)
                    entry.graphHash = graphHash(draft)
                    entry.bindingHash = stateHash({ ...live, draft })
                    entry.modelHash = modelHash({ ...live, draft })
                    entry.stage = 'binding'
                    await save()
                    await ports.draft(entry.id, draft)
                    live = await load(entry.id, definition)
                    entry.stateHash = stateHash(live)
                    entry.graphHash = graphHash(live.draft)
                    entry.stage = 'publishing'
                    await save()
                }
                await ports.publish(entry.id, {
                    environmentId: entry.environmentId,
                    releaseNotes:
                        args.releaseNotes || `${receipt.mode === 'refresh' ? 'Refreshed' : 'Installed'} ${profile.key}`
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
                throw new SuiteReleaseError(
                    `Published state does not match the prepared release for ${definition.key}.`
                )
            }
            verifyRoles(live, definition, published)
            entry.stage = 'published'
            entry.version = live.version
            entry.stateHash = stateHash(live)
            published.set(definition.key, live)
            await save()
            context.progress?.(definition.key)
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
        await save()
        return receipt
    } catch (error) {
        if (ownsReceipt) {
            receipt.status = 'failed'
            receipt.readyForTesting = false
            await save()
        }
        throw error
    }
}

exports.executeSuite = executeSuite
