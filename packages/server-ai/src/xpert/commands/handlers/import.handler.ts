import {
    AiModelTypeEnum,
    AiProviderRole,
    FetchFrom,
    ICopilot,
    ICopilotModel,
    convertToUrlPath,
    IXpert,
    IXpertAgent,
    LongTermMemoryTypeEnum,
    mapTranslationLanguage,
    omitXpertRelations,
    ProviderModel,
    replaceAgentInDraft,
    TXpertTeamDraft
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { BadRequestException } from '@nestjs/common'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { t } from 'i18next'
import { groupBy, omit } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import { CopilotOneByRoleQuery, FindCopilotModelsQuery } from '../../../copilot/queries'
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
import { XpertImportCommand } from '../import.command'

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
    'publishAt'
]
const OVERWRITE_PROTECTED_AGENT_FIELDS = [...SYSTEM_FIELDS, 'createdAt', 'updatedAt', 'xpertId', 'key']

type AvailableLlmCopilot = {
    id?: string | null
    providerWithModels?: {
        models?: ProviderModel[] | null
    } | null
}

type LlmModelSyncContext = {
    availableLlmCopilots: AvailableLlmCopilot[]
    middlewareModelTargetCatalog: MiddlewareModelTargetCatalog
}

type LlmSelection = {
    copilotId: string
    model: string
    modelType: AiModelTypeEnum.LLM
    options?: ICopilotModel['options'] | null
}

/**
 * Managed import keeps xpert as the single owner of DSL model normalization.
 * The caller may send a template with stale or missing copilot ids; this handler
 * resolves the current organization's primary LLM, makes that selection visible
 * to model validation, and then reuses copilot-model-sync.util for agent and
 * middleware model rewrites.
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
        private readonly xpertAgentService: XpertAgentService
    ) {}

    /**
     * Routes the import to either create or overwrite mode and enables managed
     * copilot normalization only for commands that explicitly request it.
     */
    public async execute(command: XpertImportCommand): Promise<IXpert> {
        const draft = command.draft as XpertDraftDslDTO
        if (!draft?.team) {
            throw new BadRequestException(t('server-ai:Error.PrimaryAgentNotFound'))
        }

        if (command.options?.targetXpertId) {
            return this.overwriteExistingXpertDraft(
                command.options.targetXpertId,
                draft,
                command.options?.normalizeCopilotModels === true
            )
        }

        return this.importAsNewXpert(draft, command.options?.normalizeCopilotModels === true)
    }

    /**
     * Creates a new xpert from the DSL, after optional model normalization, and
     * persists the normalized draft and imported long-term memories.
     */
    private async importAsNewXpert(draft: XpertDraftDslDTO, normalizeCopilotModels = false): Promise<IXpert> {
        const team = draft.team
        await this.validateImportedName(team.name)

        if (!team.agent) {
            throw new BadRequestException(t('server-ai:Error.PrimaryAgentNotFound'))
        }

        const modelSyncContext = normalizeCopilotModels ? await this.prepareManagedLlmModelSyncContext(draft) : null
        const primaryAgent = await this.syncImportDraftLlmModels(draft, modelSyncContext)

        const xpert = await this.xpertService.create({
            ...omit(team, 'draft', 'agent', 'agents', 'toolsets', 'knowledgebases', ...SYSTEM_FIELDS),
            latest: true,
            version: null,
            agent: omit(primaryAgent, ...SYSTEM_FIELDS)
        })

        let nextDraft = draft as TXpertTeamDraft
        if (!xpert.agent.options?.hidden) {
            nextDraft = replaceAgentInDraft(nextDraft, team.agent.key, xpert.agent)
        }

        await this.xpertService.saveDraft(xpert.id, {
            ...omit(nextDraft, 'memories'),
            team: xpert
        })

        if (draft.memories?.length) {
            const items = groupBy(
                draft.memories.map((item) => {
                    const namespace = item.prefix.split(':')
                    return {
                        type: namespace[namespace.length - 1] as LongTermMemoryTypeEnum,
                        value: item.value
                    }
                }),
                'type'
            )
            await Promise.all(
                Object.keys(items)
                    .filter((name) => !!name && items[name].length)
                    .map((type: LongTermMemoryTypeEnum) => {
                        const memories = items[type].map((_) => _.value)
                        return this.xpertService.createBulkMemories(xpert.id, {
                            type,
                            memories
                        })
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
        normalizeCopilotModels = false
    ): Promise<IXpert> {
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
            agent: targetPrimaryAgent
        } as TXpertTeamDraft['team']

        const nextDraft = replaceAgentInDraft(
            {
                ...(currentXpert.draft ?? {}),
                ...omit(draft, 'memories'),
                team: nextTeam,
                nodes: draft.nodes ?? [],
                connections: draft.connections ?? []
            } as TXpertTeamDraft,
            draft.team.agent.key,
            targetPrimaryAgent,
            { requireNode: false }
        )

        currentXpert.draft = await this.xpertService.saveDraft(currentXpert.id, nextDraft)
        return currentXpert
    }

    /**
     * Builds the managed import context: current available LLMs, the primary LLM
     * selection, a fallback entry for that primary model, and middleware targets.
     */
    private async prepareManagedLlmModelSyncContext(draft: XpertDraftDslDTO): Promise<LlmModelSyncContext> {
        const queriedLlmCopilots = await this.findAvailableLlmCopilots()
        const primarySelection = await this.resolvePrimaryLlmSelection()
        const availableLlmCopilots = this.includePrimaryLlmSelection(queriedLlmCopilots, primarySelection)

        if (!this.hasAvailableLlmCopilotModel(draft.team.copilotModel, availableLlmCopilots)) {
            const nextCopilotModel: ICopilotModel = {
                copilotId: primarySelection.copilotId,
                modelType: primarySelection.modelType,
                model: primarySelection.model
            }
            if (primarySelection.options) {
                nextCopilotModel.options = structuredClone(primarySelection.options)
            }
            draft.team.copilotModel = nextCopilotModel
        }

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
     * Resolves the current organization's primary copilot and validates that it
     * has an LLM model configured.
     */
    private async resolvePrimaryLlmSelection(): Promise<LlmSelection> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const primaryCopilot = await this.queryBus.execute<CopilotOneByRoleQuery, ICopilot | null>(
            new CopilotOneByRoleQuery(tenantId, organizationId, AiProviderRole.Primary, ['copilotModel'])
        )
        const primaryModel = primaryCopilot?.copilotModel
        const copilotId = this.readString(primaryCopilot?.id)
        const model = this.readString(primaryModel?.model)
        const modelType = (this.readString(primaryModel?.modelType) || AiModelTypeEnum.LLM) as AiModelTypeEnum

        if (!copilotId || !model || modelType !== AiModelTypeEnum.LLM) {
            throw new BadRequestException(
                t('server-ai:Error.ManagedImportRequiresPrimaryLlmModel', { scope: this.describeCurrentScope() })
            )
        }

        const selection = {
            copilotId,
            model,
            modelType: AiModelTypeEnum.LLM,
            options: primaryModel?.options ?? null
        } satisfies LlmSelection

        return selection
    }

    private describeCurrentScope() {
        return RequestContext.getOrganizationId()
            ? t('server-ai:Error.CurrentOrganizationScope')
            : t('server-ai:Error.TenantScope')
    }

    /**
     * Treats the primary selected LLM as available for this import even when the
     * provider catalog query does not list that custom model id.
     */
    private includePrimaryLlmSelection(availableLlmCopilots: AvailableLlmCopilot[], selection: LlmSelection) {
        if (this.hasAvailableLlmSelection(selection, availableLlmCopilots)) {
            return availableLlmCopilots
        }

        const selectedModel = this.buildProviderModelFromSelection(selection)
        if (!availableLlmCopilots.some((copilot) => this.readString(copilot?.id) === selection.copilotId)) {
            return [
                ...availableLlmCopilots,
                {
                    id: selection.copilotId,
                    providerWithModels: {
                        models: [selectedModel]
                    }
                }
            ]
        }

        return availableLlmCopilots.map((copilot) => {
            if (this.readString(copilot?.id) !== selection.copilotId) {
                return copilot
            }

            return {
                ...copilot,
                providerWithModels: {
                    ...(copilot.providerWithModels ?? {}),
                    models: [...(copilot.providerWithModels?.models ?? []), selectedModel]
                }
            }
        })
    }

    /**
     * Converts the primary selection into the ProviderModel shape expected by the
     * shared copilot model sync utilities.
     */
    private buildProviderModelFromSelection(selection: LlmSelection): ProviderModel {
        return {
            model: selection.model,
            model_type: selection.modelType,
            fetch_from: FetchFrom.CUSTOMIZABLE_MODEL,
            model_properties: {},
            features: [],
            label: {
                zh_Hans: selection.model,
                en_US: selection.model
            }
        }
    }

    /**
     * Checks whether an existing copilotModel already points to a visible LLM.
     */
    private hasAvailableLlmCopilotModel(
        copilotModel: ICopilotModel | null | undefined,
        availableLlmCopilots: AvailableLlmCopilot[]
    ) {
        const copilotId = this.readCopilotId(copilotModel)
        const model = this.readString(copilotModel?.model)
        const modelType = (this.readString(copilotModel?.modelType) || AiModelTypeEnum.LLM) as AiModelTypeEnum
        if (!copilotId || !model || modelType !== AiModelTypeEnum.LLM) {
            return false
        }

        return this.hasAvailableLlmSelection(
            {
                copilotId,
                model,
                modelType: AiModelTypeEnum.LLM
            },
            availableLlmCopilots
        )
    }

    /**
     * Checks whether a concrete copilot/model pair exists in the available LLM
     * catalog assembled for this import.
     */
    private hasAvailableLlmSelection(selection: LlmSelection, availableLlmCopilots: AvailableLlmCopilot[]) {
        return availableLlmCopilots.some((copilot) => {
            if (this.readString(copilot?.id) !== selection.copilotId) {
                return false
            }

            return (copilot?.providerWithModels?.models ?? []).some((model) => {
                const modelName = this.readString(model?.model)
                const modelType = (this.readString(model?.model_type) || AiModelTypeEnum.LLM) as AiModelTypeEnum
                return modelName === selection.model && modelType === AiModelTypeEnum.LLM
            })
        })
    }

    /**
     * Reads both modern copilotId and legacy copilot string fields from model
     * configs that may come from older DSL exports.
     */
    private readCopilotId(value: (Pick<ICopilotModel, 'copilotId'> & { copilot?: unknown }) | null | undefined) {
        return this.readString(value?.copilotId) || (typeof value?.copilot === 'string' ? value.copilot.trim() : '')
    }

    /**
     * Normalizes optional string-like fields before comparison.
     */
    private readString(value: unknown) {
        return typeof value === 'string' ? value.trim() : ''
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
