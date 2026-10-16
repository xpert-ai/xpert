import { BadRequestException, Injectable } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { stringify } from 'yaml'
import { t } from 'i18next'
import { resolveI18nText, XpertTypeEnum, type TXpertTemplate } from '@xpert-ai/contracts'
import { AgentPluginInstallationsService, pluginRuntimeComponents } from '../agent-plugin-installations.service'
import { AgentPluginPackage } from '../agent-plugin.entity'
import { containedPath } from '../agent-plugin-parser'
import { portablePackageDigest } from '../agent-plugin-source'
import { normalizeAssistantTemplateDefinition } from '../../xpert-template/definition/normalize-assistant-template'
import {
    AgentPluginTemplatesCommand,
    ResolveAgentPluginTemplateDependencyCommand,
    AssertAgentPluginTemplateDependencyCommand
} from './agent-plugin-template.command'

export const agentPluginTemplateId = (name: string, key: string) => `agent-plugin/${name}/${key}`

@Injectable()
export class AgentPluginTemplateService {
    constructor(private readonly installations: AgentPluginInstallationsService) {}

    private async verify(pkg: AgentPluginPackage) {
        if ((await portablePackageDigest(pkg.rootPath)) !== pkg.digest) this.changed()
    }

    async templates(id?: string, language?: string, summaryOnly = false): Promise<TXpertTemplate[]> {
        const result: TXpertTemplate[] = []
        // Template keys contain no slashes; the preceding path is the declared package name.
        const separator = id?.lastIndexOf('/') ?? -1
        if (
            id &&
            (!id.startsWith('agent-plugin/') || separator <= 'agent-plugin/'.length || separator === id.length - 1)
        )
            return result
        const packageName = id?.slice('agent-plugin/'.length, separator)
        // Every role may supply templates, including assistant-only packages hidden from ChatKit.
        for (const { binding, pkg } of await this.installations.installedCatalog(undefined, packageName)) {
            if (
                !binding.enabled ||
                !(pkg.descriptor.templates ?? []).some(
                    (entry) => !id || agentPluginTemplateId(pkg.descriptor.name, entry.key) === id
                )
            )
                continue
            if (summaryOnly && pkg.descriptor.templateCatalog) {
                for (const entry of pkg.descriptor.templates ?? []) {
                    if (id && agentPluginTemplateId(pkg.descriptor.name, entry.key) !== id) continue
                    const snapshot = pkg.descriptor.templateCatalog[entry.key]
                    if (!snapshot) continue
                    result.push(this.summary(pkg, entry, snapshot, language))
                }
                continue
            }
            // Invalidated files must not supply new DSL under an old package digest.
            try {
                await this.verify(pkg)
            } catch (error) {
                if (id) throw error
                continue
            }
            const snapshot: NonNullable<typeof pkg.descriptor.templateCatalog> = {}
            for (const entry of pkg.descriptor.templates ?? []) {
                const templateId = agentPluginTemplateId(pkg.descriptor.name, entry.key)
                if (id && templateId !== id) continue
                const normalized = normalizeAssistantTemplateDefinition({
                    export_data: await readFile(await containedPath(pkg.rootPath, entry.path), 'utf8')
                })
                const team = normalized.definition.team
                snapshot[entry.key] = {
                    name: team.name || entry.key,
                    title: team.title || team.name || entry.key,
                    description: team.description || '',
                    avatar: team.avatar ?? null,
                    type: team.type
                }
                if (summaryOnly) {
                    result.push(this.summary(pkg, entry, snapshot[entry.key], language))
                    continue
                }
                const dependencies = normalized.dependencies
                for (const selector of [...(dependencies.skills ?? []), ...(dependencies.mcpServers ?? [])]) {
                    if (selector.source?.name === pkg.descriptor.name && !selector.source.digest)
                        selector.source.digest = pkg.digest
                }
                const export_data = stringify(normalized.definition)
                result.push({
                    id: templateId,
                    key: entry.key,
                    name: team.name || entry.key,
                    title: resolveI18nText(entry.presentation?.title, language) || team.title || team.name || entry.key,
                    description: resolveI18nText(entry.presentation?.description, language) || team.description || '',
                    avatar: team.avatar ?? null,
                    type: team.type ?? XpertTypeEnum.Agent,
                    category: entry.category ?? 'assistant',
                    copyright: '',
                    source: 'agent-plugin',
                    pluginDisplayName:
                        resolveI18nText(entry.presentation?.pluginDisplayName, language) ||
                        resolveI18nText(pkg.descriptor.extension?.interface?.displayName, language) ||
                        pkg.descriptor.name,
                    pluginVersion: pkg.descriptor.version || pkg.digest,
                    contentHash: createHash('sha256').update(export_data).digest('hex'),
                    dependencies,
                    manifest: normalized.manifest,
                    export_data
                })
            }
            // A targeted avatar lookup must not replace a multi-template package with a partial snapshot.
            if (summaryOnly && !id) await this.installations.saveTemplateCatalog(pkg, snapshot)
        }
        return result
    }

    private summary(
        pkg: AgentPluginPackage,
        entry: NonNullable<AgentPluginPackage['descriptor']['templates']>[number],
        snapshot: NonNullable<AgentPluginPackage['descriptor']['templateCatalog']>[string],
        language?: string
    ): TXpertTemplate {
        return {
            ...snapshot,
            type: snapshot.type ?? XpertTypeEnum.Agent,
            id: agentPluginTemplateId(pkg.descriptor.name, entry.key),
            key: entry.key,
            title: resolveI18nText(entry.presentation?.title, language) || snapshot.title,
            description: resolveI18nText(entry.presentation?.description, language) || snapshot.description,
            pluginDisplayName:
                resolveI18nText(entry.presentation?.pluginDisplayName, language) ||
                resolveI18nText(pkg.descriptor.extension?.interface?.displayName, language) ||
                pkg.descriptor.name,
            category: entry.category ?? 'assistant',
            source: 'agent-plugin',
            copyright: '',
            pluginVersion: pkg.descriptor.version || pkg.digest,
            export_data: ''
        }
    }

    async resolve(command: ResolveAgentPluginTemplateDependencyCommand) {
        const source = command.selector.source
        if (source?.kind !== 'agent-plugin') this.changed()
        const resolved = await this.installations.templatePackage(source.name, source.digest, command.workspaceId)
        if (!resolved) this.changed()
        const { pkg, binding } = resolved
        await this.verify(pkg)
        const resource = pluginRuntimeComponents(pkg, binding.version).find(
            (item) =>
                item.component.componentType === command.kind &&
                item.component.componentKey === command.selector.componentKey
        )
        if (!resource) this.changed()
        await this.installations.retainTemplateReference({ bindingId: binding.id, version: binding.version })
        return {
            component: {
                ...resource,
                runtimeSource: 'agent-plugin' as const,
                targetAgentKey: command.selector.targetAgentKey,
                ...('policyOverrides' in command.selector ? { policyOverrides: command.selector.policyOverrides } : {})
            },
            lock: {
                pluginName: resource.pluginName,
                version: pkg.digest,
                source: {
                    kind: 'agent-plugin' as const,
                    name: source.name,
                    digest: pkg.digest,
                    bindingId: binding.id,
                    bindingVersion: binding.version
                },
                components: [{ type: command.kind, key: command.selector.componentKey, hash: pkg.digest }]
            }
        }
    }

    async assert(command: AssertAgentPluginTemplateDependencyCommand) {
        const { lock } = command
        const source = lock.source
        if (!source) this.changed()
        const resolved = await this.installations.reference({
            bindingId: source.bindingId,
            version: source.bindingVersion
        })
        if (
            !resolved ||
            resolved.pkg.descriptor.name !== source.name ||
            resolved.pkg.digest !== source.digest ||
            lock.version !== source.digest ||
            lock.providers?.length
        )
            this.changed()
        await this.verify(resolved.pkg)
        const components = pluginRuntimeComponents(resolved.pkg, resolved.binding.version)
        for (const entry of lock.components) {
            if (
                !components.some(
                    (item) =>
                        item.pluginName === lock.pluginName &&
                        item.component.componentType === entry.type &&
                        item.component.componentKey === entry.key &&
                        item.component.definitionHash === entry.hash
                )
            )
                this.changed()
        }
    }

    private changed(): never {
        throw new BadRequestException(t('server-ai:Error.TemplateDependencyChanged'))
    }
}

@CommandHandler(AgentPluginTemplatesCommand)
export class AgentPluginTemplatesHandler implements ICommandHandler<AgentPluginTemplatesCommand> {
    constructor(private readonly service: AgentPluginTemplateService) {}
    execute(command: AgentPluginTemplatesCommand) {
        return this.service.templates(command.id, command.language, command.summaryOnly)
    }
}
@CommandHandler(ResolveAgentPluginTemplateDependencyCommand)
export class ResolveAgentPluginTemplateDependencyHandler implements ICommandHandler<ResolveAgentPluginTemplateDependencyCommand> {
    constructor(private readonly service: AgentPluginTemplateService) {}
    execute(command: ResolveAgentPluginTemplateDependencyCommand) {
        return this.service.resolve(command)
    }
}
@CommandHandler(AssertAgentPluginTemplateDependencyCommand)
export class AssertAgentPluginTemplateDependencyHandler implements ICommandHandler<AssertAgentPluginTemplateDependencyCommand> {
    constructor(private readonly service: AgentPluginTemplateService) {}
    execute(command: AssertAgentPluginTemplateDependencyCommand) {
        return this.service.assert(command)
    }
}
