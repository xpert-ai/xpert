import { stringify } from 'yaml'
import {
    PrepareAssistantDefinitionCommand,
    InstallAssistantDefinitionDependenciesCommand
} from '../../../plugin-resource/template-installation/template-readiness.command'
import type { TXpertTemplate } from '@xpert-ai/contracts'
import {
    AiModelTypeEnum,
    DEFAULT_XPERT_WORKSPACE_DATA_SCOPE,
    convertToUrlPath,
    IXpert,
    IXpertAgent,
    LongTermMemoryTypeEnum,
    mapTranslationLanguage,
    omitXpertRelations,
    resolveI18nText,
    replaceAgentInDraft,
    TXpertOptions,
    TXpertTemplateSource,
    TXpertTeamDraft
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { BadRequestException, Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { t } from 'i18next'
import { groupBy, omit } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import { FindCopilotModelsQuery } from '../../../copilot/queries'
import { AvailableLlmCopilot, findAvailableLlmSelection, findDefaultLlmSelection } from '../../../copilot/llm-selection'
import { XpertAgentService } from '../../../xpert-agent/xpert-agent.service'
import { XpertNameInvalidException } from '../../types'
import {
    buildMiddlewareModelTargetCatalog,
    MiddlewareModelTargetCatalog,
    syncDraftLlmModelConfigsWithTeamSelection,
    syncPrimaryAgentModelWithTeamSelection
} from '../../copilot-model-sync.util'
import { XpertService } from '../../xpert.service'
import { XpertDraftDslDTO } from '../../dto'
import { normalizeImportedSandboxFeatures } from '../../import-draft.utils'
import { createTemplateSourceFromIds, resolveTemplateSourceFromOptions } from '../../template-source'
import { XpertImportCommand } from '../import.command'
import { loadReservedTemplateAssistant } from '../../template-import-recovery'
import { preserveTemplateInstanceBindings } from '../../template-sync/instance-bindings'

const SYSTEM_FIELDS = ['tenantId', 'organizationId', 'id', 'createdById', 'updatedById']
const OVERWRITE_PROTECTED_TEAM_FIELDS = [
    ...SYSTEM_FIELDS,
    'createdAt',
    'updatedAt',
    'workspaceId',
    'type',
    'agent',
    'slug',
    'latest',
    'version',
    'publishAt',
    'workspaceDataScope'
]
const OVERWRITE_PROTECTED_AGENT_FIELDS = [...SYSTEM_FIELDS, 'createdAt', 'updatedAt', 'xpertId', 'key']

type LlmModelSyncContext = {
    availableLlmCopilots: AvailableLlmCopilot[]
    middlewareModelTargetCatalog: MiddlewareModelTargetCatalog
}

/**
 * Managed import preserves authorized bindings and resolves a default only when needed.
 * Defaults must belong to the governed catalog; provider visibility cannot grant model access.
 */

/**
 * @todo add import toolsets and knowledgebases
 */
@CommandHandler(XpertImportCommand)
export class XpertImportHandler implements ICommandHandler<XpertImportCommand> {
    constructor(
        private readonly xpertService: XpertService,
        private readonly i18n: I18nService,
        private readonly queryBus: QueryBus,
        private readonly xpertAgentService: XpertAgentService,
        @Inject(CommandBus) private readonly commands: Pick<CommandBus, 'execute'>
    ) {}

    /**
     * Routes the import to either create or overwrite mode and enables managed
     * copilot normalization only for commands that explicitly request it.
     */
    public async execute(command: XpertImportCommand): Promise<IXpert> {
        normalizeImportedLocalizedText(
            command.draft,
            command.options.language ?? RequestContext.getLanguageCode() ?? 'en-US'
        )
        const draft = command.draft as XpertDraftDslDTO
        if (!draft?.team) {
            throw new BadRequestException(t('server-ai:Error.PrimaryAgentNotFound'))
        }

        // Imported source data cannot supply installation receipts or dependency locks.
        draft.team.options = { ...draft.team.options }
        delete draft.team.options.pendingPublication
        delete draft.team.options.templateDefinition
        delete draft.team.options.templateDependencyLocks
        let portableTemplate: TXpertTemplate | undefined
        let locks = command.options.dependencyLocks
        let definition = command.options.templateDefinition
        if (draft.template && command.options.targetXpertId) {
            const target = await this.loadXpertById(command.options.targetXpertId)
            draft.team.workspaceId = target.workspaceId
            const requestedScope = draft.template.manifest?.files?.scope
            if (requestedScope && requestedScope !== target.workspaceDataScope)
                throw new BadRequestException(t('server-ai:Error.TemplateFileScopeConflict'))
        }
        if (draft.template && !definition) {
            portableTemplate = {
                id: 'imported-assistant',
                name: draft.team.name,
                title: draft.team.title ?? '',
                description: '',
                category: '',
                copyright: '',
                avatar: draft.team.avatar,
                type: draft.team.type,
                export_data: stringify(draft)
            }
            const prepared = await this.commands.execute(
                new PrepareAssistantDefinitionCommand(portableTemplate, draft.team.workspaceId)
            )
            definition = prepared.definition.template
            locks = prepared.locks
        }
        if (definition) draft.team.options.templateDefinition = definition
        if (locks) draft.team.options.templateDependencyLocks = locks
        const dataScope = definition?.manifest?.files?.scope ?? command.options.workspaceDataScope
        if (draft.team.features?.sandbox?.enabled) {
            const providers = await this.xpertService.getSandboxProviders()
            draft.team.features = normalizeImportedSandboxFeatures(
                draft.team.features,
                definition ? providers.filter(({ type }) => type !== 'local-shell-sandbox') : providers
            )
        }

        const templateSource = this.resolveImportTemplateSource(command, draft)

        if (command.options?.targetXpertId) {
            const updated = await this.overwriteExistingXpertDraft(
                command.options.targetXpertId,
                draft,
                command.options?.normalizeCopilotModels === true,
                templateSource,
                command.options.preserveInstanceBindings === true
            )
            if (portableTemplate)
                await this.commands.execute(
                    new InstallAssistantDefinitionDependenciesCommand(portableTemplate, updated, locks ?? [])
                )
            return updated
        }

        const imported = await this.importAsNewXpert(
            draft,
            command.options?.normalizeCopilotModels === true,
            templateSource,
            dataScope,
            command.options.newXpertId
        )
        if (portableTemplate)
            await this.commands.execute(
                new InstallAssistantDefinitionDependenciesCommand(portableTemplate, imported, locks ?? [])
            )
        return imported
    }

    /**
     * Creates a new xpert from the DSL, after optional model normalization, and
     * persists the normalized draft and imported long-term memories.
     */
    private async importAsNewXpert(
        draft: XpertDraftDslDTO,
        normalizeCopilotModels = false,
        templateSource?: TXpertTemplateSource | null,
        workspaceDataScope = DEFAULT_XPERT_WORKSPACE_DATA_SCOPE,
        newXpertId?: string
    ): Promise<IXpert> {
        const team = draft.team
        const prior = newXpertId
            ? await loadReservedTemplateAssistant(this.xpertService, newXpertId, team.workspaceId, templateSource)
            : null
        await this.validateImportedName(team.name, prior)

        if (!team.agent) {
            throw new BadRequestException(t('server-ai:Error.PrimaryAgentNotFound'))
        }

        const modelSyncContext = normalizeCopilotModels ? await this.prepareManagedLlmModelSyncContext(draft) : null
        const primaryAgent = await this.syncImportDraftLlmModels(draft, modelSyncContext)

        const xpert =
            prior ??
            (await this.xpertService.create({
                ...omit(
                    team,
                    'draft',
                    'agent',
                    'agents',
                    'toolsets',
                    'knowledgebases',
                    'workspaceDataScope',
                    ...SYSTEM_FIELDS
                ),
                ...(newXpertId ? { id: newXpertId } : {}),
                workspaceDataScope,
                options: this.withTemplateSource(team.options, templateSource),
                latest: true,
                version: null,
                agent: omit(primaryAgent, ...SYSTEM_FIELDS)
            }))

        let nextDraft = draft as TXpertTeamDraft
        if (!xpert.agent.options?.hidden) {
            nextDraft = replaceAgentInDraft(nextDraft, team.agent.key, xpert.agent)
        }

        await this.xpertService.saveDraft(xpert.id, {
            ...omit(nextDraft, 'memories', 'template'),
            team: xpert
        })

        if (draft.memories?.length) {
            const items = groupBy(
                draft.memories.map((item, index) => {
                    const namespace = item.prefix.split(':')
                    return {
                        type: namespace[namespace.length - 1] as LongTermMemoryTypeEnum,
                        value: item.value,
                        key: newXpertId ? `template-seed-${newXpertId}-${index}` : undefined
                    }
                }),
                'type'
            )
            await Promise.all(
                Object.keys(items)
                    .filter((name) => !!name && items[name].length)
                    .map((type: LongTermMemoryTypeEnum) => {
                        const memories = items[type].map((_) => _.value)
                        return newXpertId
                            ? this.xpertService.createBulkMemories(
                                  xpert.id,
                                  { type, memories },
                                  items[type].map((item) => item.key)
                              )
                            : this.xpertService.createBulkMemories(xpert.id, { type, memories })
                    })
            )
        }

        return xpert
    }

    /**
     * Imports the DSL into an existing xpert while preserving protected identity,
     * workspace, and primary-agent fields from the current persisted xpert.
     */
    private async overwriteExistingXpertDraft(
        targetXpertId: string,
        draft: XpertDraftDslDTO,
        normalizeCopilotModels = false,
        templateSource?: TXpertTemplateSource | null,
        preserveInstanceBindings = false
    ): Promise<IXpert> {
        if (preserveInstanceBindings) await this.xpertService.assertCanAuthorById(targetXpertId)
        const currentXpert = await this.loadXpertById(targetXpertId)
        if (draft.team.type !== currentXpert.type) {
            throw new BadRequestException('DSL type does not match the current xpert.')
        }

        if (!currentXpert.agent?.key || !draft.team.agent?.key) {
            throw new BadRequestException(t('server-ai:Error.PrimaryAgentNotFound'))
        }

        await this.validateImportedName(draft.team.name, currentXpert)
        if (normalizeCopilotModels) {
            const modelSyncContext = await this.prepareManagedLlmModelSyncContext(draft)
            await this.syncImportDraftLlmModels(draft, modelSyncContext)
        }
        if (preserveInstanceBindings) {
            preserveTemplateInstanceBindings(
                draft,
                currentXpert,
                buildMiddlewareModelTargetCatalog(this.xpertAgentService.getMiddlewareStrategies())
            )
        }

        const currentTeam = {
            ...omitXpertRelations(currentXpert),
            ...(currentXpert.draft?.team ?? {}),
            agent: currentXpert.agent
        } as TXpertTeamDraft['team']

        const importedPrimaryAgent = getLatestPrimaryAgent(draft, draft.team.agent.key)
        const targetPrimaryAgent = {
            ...currentXpert.agent,
            ...omit(importedPrimaryAgent, ...OVERWRITE_PROTECTED_AGENT_FIELDS),
            key: currentXpert.agent.key
        } as IXpertAgent

        const nextTeam = {
            ...currentTeam,
            ...omit(draft.team, ...OVERWRITE_PROTECTED_TEAM_FIELDS),
            id: currentTeam.id ?? currentXpert.id,
            workspaceId: currentTeam.workspaceId ?? currentXpert.workspaceId,
            type: currentXpert.type,
            agent: targetPrimaryAgent,
            options: this.withTemplateSource(
                {
                    ...(currentTeam.options ?? {}),
                    ...(draft.team.options ?? {})
                },
                templateSource
            )
        } as TXpertTeamDraft['team']

        const nextDraft = replaceAgentInDraft(
            {
                ...(currentXpert.draft ?? {}),
                ...omit(draft, 'memories', 'template'),
                team: nextTeam,
                nodes: draft.nodes ?? [],
                connections: draft.connections ?? []
            } as TXpertTeamDraft,
            draft.team.agent.key,
            targetPrimaryAgent,
            { requireNode: false }
        )

        currentXpert.draft = await this.xpertService.saveDraft(currentXpert.id, nextDraft)
        if (templateSource) {
            currentXpert.options = this.withTemplateSource(currentXpert.options, templateSource)
        }
        return currentXpert
    }

    private resolveImportTemplateSource(command: XpertImportCommand, draft: XpertDraftDslDTO) {
        const identity = createTemplateSourceFromIds(command.options.templateId, command.options.sourceTemplateId)
        const embedded = resolveTemplateSourceFromOptions(draft.team.options)
        // The selected ID owns identity; only its matching DSL may supply locale/revision metadata.
        const source =
            command.options.templateSource ??
            (identity ? { ...(embedded?.templateId === identity.templateId ? embedded : {}), ...identity } : embedded)
        if (!source) {
            return null
        }

        const now = new Date().toISOString()
        return {
            ...source,
            installedAt: source.installedAt ?? now,
            lastSyncedAt: source.lastSyncedAt ?? now
        } satisfies TXpertTemplateSource
    }

    private withTemplateSource(options?: TXpertOptions | null, templateSource?: TXpertTemplateSource | null) {
        if (!templateSource) {
            return options
        }

        return {
            ...(options ?? {}),
            templateSource
        } satisfies TXpertOptions
    }

    private async prepareManagedLlmModelSyncContext(draft: XpertDraftDslDTO): Promise<LlmModelSyncContext> {
        const availableLlmCopilots = await this.findAvailableLlmCopilots()
        const selection =
            findAvailableLlmSelection(availableLlmCopilots, draft.team.copilotModel) ??
            findDefaultLlmSelection(availableLlmCopilots)
        if (!selection) {
            throw new BadRequestException(t('server-ai:Error.ManagedImportRequiresLlmSelection'))
        }
        draft.team.copilotModel = selection
        return {
            availableLlmCopilots,
            middlewareModelTargetCatalog: buildMiddlewareModelTargetCatalog(
                this.xpertAgentService.getMiddlewareStrategies()
            )
        }
    }

    /**
     * Applies the selected team LLM to the primary agent and to middleware fields
     * whose provider config schema declares an ai-model-select LLM target.
     */
    private async syncImportDraftLlmModels(
        draft: XpertDraftDslDTO,
        modelSyncContext?: LlmModelSyncContext | null
    ): Promise<IXpertAgent> {
        const team = draft.team
        if (!team.agent?.key) {
            throw new BadRequestException(t('server-ai:Error.PrimaryAgentNotFound'))
        }

        const context =
            modelSyncContext ??
            ({
                availableLlmCopilots: await this.findAvailableLlmCopilots(),
                middlewareModelTargetCatalog: buildMiddlewareModelTargetCatalog(
                    this.xpertAgentService.getMiddlewareStrategies()
                )
            } satisfies LlmModelSyncContext)
        const primaryAgent = getLatestPrimaryAgent(draft, team.agent.key)

        syncPrimaryAgentModelWithTeamSelection(
            {
                copilotModel: team.copilotModel,
                agent: primaryAgent
            },
            context.availableLlmCopilots
        )
        syncDraftLlmModelConfigsWithTeamSelection(
            draft,
            context.availableLlmCopilots,
            context.middlewareModelTargetCatalog
        )

        return primaryAgent
    }

    /**
     * Reads xpert's currently visible LLM copilot/model catalog for this tenant
     * and organization.
     */
    private async findAvailableLlmCopilots(): Promise<AvailableLlmCopilot[]> {
        return await this.queryBus.execute<FindCopilotModelsQuery, AvailableLlmCopilot[]>(
            new FindCopilotModelsQuery(AiModelTypeEnum.LLM)
        )
    }

    /**
     * Validates import name uniqueness, allowing an overwrite to keep its own
     * current slug.
     */
    private async validateImportedName(name: string, currentXpert?: IXpert) {
        const nextSlug = convertToUrlPath(name)
        if (currentXpert && nextSlug === currentXpert.slug) {
            return
        }

        const valid = await this.xpertService.validateName(name)
        if (!valid) {
            throw new XpertNameInvalidException(
                await this.i18n.t('xpert.Error.NameInvalid', {
                    lang: mapTranslationLanguage(RequestContext.getLanguageCode())
                })
            )
        }
    }

    /**
     * Loads the target xpert and the relations needed to protect existing
     * identity fields during overwrite import.
     */
    private async loadXpertById(xpertId: string) {
        const xpert = await this.xpertService.repository.findOne({
            where: {
                id: xpertId
            },
            relations: [
                'agent',
                'agent.copilotModel',
                'copilotModel',
                'agents',
                'agents.copilotModel',
                'toolsets',
                'knowledgebases'
            ]
        })

        if (!xpert) {
            throw new BadRequestException(`Xpert '${xpertId}' was not found.`)
        }

        return xpert
    }
}

/**
 * Resolves localized template metadata at the untyped DSL boundary so Xpert
 * and XpertAgent persistence never receive objects for string columns.
 */
function normalizeImportedLocalizedText(value: unknown, language: string) {
    if (!isObjectValue(value)) {
        return
    }

    const team = Reflect.get(value, 'team')
    if (isObjectValue(team)) {
        normalizeLocalizedTextFields(team, language)
        const primaryAgent = Reflect.get(team, 'agent')
        if (isObjectValue(primaryAgent)) {
            normalizeLocalizedTextFields(primaryAgent, language)
        }
    }

    const nodes = Reflect.get(value, 'nodes')
    if (!Array.isArray(nodes)) {
        return
    }

    for (const node of nodes) {
        if (!isObjectValue(node)) {
            continue
        }
        const type = Reflect.get(node, 'type')
        if (type !== 'agent' && type !== 'xpert') {
            continue
        }
        const entity = Reflect.get(node, 'entity')
        if (isObjectValue(entity)) {
            normalizeLocalizedTextFields(entity, language)
        }
    }
}

function normalizeLocalizedTextFields(value: object, language: string) {
    for (const key of ['title', 'description'] as const) {
        const field = Reflect.get(value, key)
        if (typeof field === 'undefined') {
            continue
        }
        const normalized = resolveI18nText(field, language)
        if (normalized) {
            Reflect.set(value, key, normalized)
        } else {
            Reflect.deleteProperty(value, key)
        }
    }
}

function isObjectValue(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Returns the latest primary agent entity from the DSL, or a hidden placeholder
 * when the imported DSL is a pure workflow without a visible primary agent node.
 */
function getLatestPrimaryAgent(draft: TXpertTeamDraft, key: string): IXpertAgent {
    const index = draft.nodes.findIndex((_) => _.type === 'agent' && _.key === key)
    if (index > -1) {
        return draft.nodes[index].entity as IXpertAgent
    } else {
        // This is pure workflow, no primary agent.
        return {
            key,
            options: {
                hidden: true
            }
        }
    }
}
