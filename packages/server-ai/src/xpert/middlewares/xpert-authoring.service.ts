import {
    AiModelTypeEnum,
    ChecklistItem,
    ISkillPackage,
    IXpert,
    ModelFeature,
    ProviderModel,
    TXpertTeamDraft,
    TXpertTeamNode,
    TXpertTeamConnection,
    WorkflowNodeTypeEnum,
    XpertTypeEnum,
    convertToUrlPath,
    createAgentConnections,
    createXpertNodes,
    letterStartSUID,
    omitXpertRelations
} from '@metad/contracts'
import { yaml } from '@metad/server-common'
import { RequestContext } from '@metad/server-core'
import { Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { instanceToPlain } from 'class-transformer'
import { createHash } from 'crypto'
import { KnowledgebaseService } from '../../knowledgebase/knowledgebase.service'
import { FindCopilotModelsQuery } from '../../copilot/queries'
import { XpertAgentService } from '../../xpert-agent/xpert-agent.service'
import { ListWorkspaceSkillsQuery } from '../../xpert-agent/queries/list-workspace-skills.query'
import { XpertToolsetService } from '../../xpert-toolset/xpert-toolset.service'
import { XpertExportCommand, XpertImportCommand } from '../commands'
import { buildOverwriteDraftFromImportedDsl } from '../import-draft.utils'
import { XpertService } from '../xpert.service'
import {
    AgentMiddlewareCatalogItem,
    AuthoringDiagnostic,
    AssistantDraftConflictError,
    AssistantDraftMutationResult,
    AuthoringConflictType,
    AuthoringCatalogResult,
    AuthoringAssistantRequestContext,
    AuthoringToolName,
    CopilotModelCatalogItem,
    CopilotModelCatalogResult,
    CopilotModelCatalogSnapshot,
    CurrentXpertDslResult,
    EditXpertPayload,
    KnowledgebaseCatalogItem,
    NewXpertPayload,
    SkillCatalogItem,
    ToolsetCatalogItem
} from './xpert-authoring.types'

const VALID_NODE_TYPES = new Set(['agent', 'knowledge', 'toolset', 'xpert', 'workflow'])
const VALID_CONNECTION_TYPES = new Set(['edge', 'agent', 'knowledge', 'toolset', 'xpert', 'workflow'])
const VALID_WORKFLOW_NODE_TYPES = new Set(Object.values(WorkflowNodeTypeEnum))
const WORKFLOW_TOP_INPUT_TYPES = new Set([
    WorkflowNodeTypeEnum.AGENT_TOOL,
    WorkflowNodeTypeEnum.MIDDLEWARE,
    WorkflowNodeTypeEnum.SKILL,
    WorkflowNodeTypeEnum.TASK
])
const WORKFLOW_EDGE_INPUT_DISABLED_TYPES = new Set([
    WorkflowNodeTypeEnum.AGENT_TOOL,
    WorkflowNodeTypeEnum.MIDDLEWARE,
    WorkflowNodeTypeEnum.NOTE,
    WorkflowNodeTypeEnum.START,
    WorkflowNodeTypeEnum.TASK,
    WorkflowNodeTypeEnum.TRIGGER
])
const WORKFLOW_EDGE_OUTPUT_DISABLED_TYPES = new Set([
    WorkflowNodeTypeEnum.MIDDLEWARE,
    WorkflowNodeTypeEnum.NOTE,
    WorkflowNodeTypeEnum.SKILL,
    WorkflowNodeTypeEnum.TASK
])
const WORKFLOW_AGENT_OUTPUT_TYPES = new Set([
    WorkflowNodeTypeEnum.ITERATING,
    WorkflowNodeTypeEnum.ITERATOR,
    WorkflowNodeTypeEnum.SKILL,
    WorkflowNodeTypeEnum.SUBFLOW,
    WorkflowNodeTypeEnum.TASK
])
const WORKFLOW_XPERT_OUTPUT_TYPES = new Set([
    WorkflowNodeTypeEnum.ITERATING,
    WorkflowNodeTypeEnum.ITERATOR,
    WorkflowNodeTypeEnum.SUBFLOW
])
const AUTHORING_CATALOG_MODEL_TYPES: AiModelTypeEnum[] = [
    AiModelTypeEnum.LLM,
    AiModelTypeEnum.TEXT_EMBEDDING,
    AiModelTypeEnum.RERANK,
    AiModelTypeEnum.SPEECH2TEXT,
    AiModelTypeEnum.TTS
]

type ModelScanContext = {
    nodeKey?: string | null
    nodeType?: string | null
    workflowEntityType?: string | null
    middlewareProvider?: string | null
}

type ModelConfigTarget = {
    owner: Record<string, unknown>
    key: string
    label: string
    expectedModelType: AiModelTypeEnum
    requiredFeatures: ModelFeature[]
}

@Injectable()
export class XpertAuthoringService {
    constructor(
        private readonly xpertService: XpertService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly xpertAgentService: XpertAgentService,
        private readonly xpertToolsetService: XpertToolsetService,
        private readonly knowledgebaseService: KnowledgebaseService
    ) {}

    async getCurrentXpertFromContext(context: AuthoringAssistantRequestContext): Promise<CurrentXpertDslResult> {
        if (!context.targetXpertId) {
            return {
                xpertId: null,
                dslYaml: null,
                summary: 'Missing xpertId for current Xpert DSL export.'
            }
        }

        const xpert = await this.loadXpertById(context.targetXpertId)
        const currentDraft = this.getEditableDraft(xpert)

        return {
            xpertId: xpert.id,
            dslYaml: await this.exportDraftDslYaml(xpert.id),
            summary: `Loaded "${xpert.title || xpert.name || 'current Xpert'}" as YAML DSL.`,
            committedDraftHash: this.calculateDraftHash(currentDraft)
        }
    }

    async getAvailableAgentMiddlewaresFromContext(
        context: AuthoringAssistantRequestContext
    ): Promise<AuthoringCatalogResult<AgentMiddlewareCatalogItem>> {
        const items = this.xpertAgentService.getMiddlewareStrategies().map(({ meta }) => ({
            name: meta.name,
            label: meta.label,
            description: meta.description,
            icon: meta.icon,
            configSchema: meta.configSchema
        }))

        return this.buildCatalogResult(items, {
            workspaceId: this.requireWorkspaceId(context),
            emptySummary: 'No agent middlewares are currently available.',
            foundSummary: `Found ${items.length} agent middlewares available to the assistant.`
        })
    }

    async getAvailableToolsetsFromContext(
        context: AuthoringAssistantRequestContext
    ): Promise<AuthoringCatalogResult<ToolsetCatalogItem>> {
        const workspaceId = this.requireWorkspaceId(context)
        if (!workspaceId) {
            return this.buildRejectedCatalogResult('Missing workspaceId in request context.')
        }

        const result = await this.xpertToolsetService.getAllByWorkspace(
            workspaceId,
            {} as any,
            false,
            RequestContext.currentUser()
        )
        const toolsets = await this.xpertToolsetService.afterLoad(result.items)
        const items = toolsets.map((toolset) => ({
            id: toolset.id,
            name: toolset.name,
            category: toolset.category ?? null,
            type: toolset.type ?? null,
            description: toolset.description ?? null,
            tags: toolset.tags?.map((tag) => tag.name).filter((tag): tag is string => Boolean(tag)) ?? [],
            avatar: toolset.avatar
        }))

        return this.buildCatalogResult(items, {
            workspaceId,
            emptySummary: `No toolsets are currently available in workspace '${workspaceId}'.`,
            foundSummary: `Found ${items.length} toolsets available in workspace '${workspaceId}'.`
        })
    }

    async getAvailableCopilotModelsFromContext(
        context: AuthoringAssistantRequestContext
    ): Promise<CopilotModelCatalogResult> {
        const currentDraftCopilotModel = context.targetXpertId
            ? await this.getCurrentCopilotModelSelection(context.targetXpertId)
            : null

        const catalogs = await Promise.all(
            AUTHORING_CATALOG_MODEL_TYPES.map(async (modelType) => ({
                modelType,
                copilots: await this.queryBus.execute(new FindCopilotModelsQuery(modelType))
            }))
        )

        const allItems = catalogs.flatMap(({ modelType, copilots }) =>
            (copilots ?? []).flatMap((copilot) => {
                const provider = copilot?.modelProvider?.providerName ?? copilot?.providerWithModels?.provider ?? null
                const models = (copilot?.providerWithModels?.models ?? []) as ProviderModel[]

                return models
                    .map((model): CopilotModelCatalogItem | null => {
                        const modelId = typeof model?.model === 'string' ? model.model.trim() : ''
                        const resolvedModelType = model?.model_type ?? modelType
                        if (!modelId) {
                            return null
                        }

                        return {
                            copilotId: copilot.id,
                            provider,
                            modelType: resolvedModelType,
                            model: modelId,
                            label: this.pickI18nText(model?.label) ?? modelId,
                            features: (model?.features as ModelFeature[] | undefined) ?? null,
                            isCurrentProvider: false,
                            isCurrentModel: false
                        }
                    })
                    .filter((item): item is CopilotModelCatalogItem => Boolean(item))
            })
        )

        const deduplicatedItems = allItems.filter(
            (item, index, list) =>
                list.findIndex(
                    (candidate) =>
                        candidate.copilotId === item.copilotId &&
                        candidate.provider === item.provider &&
                        candidate.modelType === item.modelType &&
                        candidate.model === item.model
                ) === index
        )
        const currentSelection = currentDraftCopilotModel
            ? deduplicatedItems.find(
                  (item) =>
                      item.modelType === AiModelTypeEnum.LLM &&
                      item.model === currentDraftCopilotModel.model &&
                      item.copilotId === currentDraftCopilotModel.copilotId
              ) ??
              deduplicatedItems.find(
                  (item) =>
                      item.modelType === AiModelTypeEnum.LLM &&
                      item.model === currentDraftCopilotModel.model &&
                      item.provider === currentDraftCopilotModel.provider
              ) ??
              null
            : null
        const currentCopilotId = currentSelection?.copilotId ?? null
        const currentProvider = currentSelection?.provider ?? null
        const currentModelId = currentSelection?.model ?? null
        const items = currentProvider
            ? deduplicatedItems.filter(
                  (item) => item.modelType !== AiModelTypeEnum.LLM || item.provider === currentProvider
              )
            : deduplicatedItems
        const decoratedItems = items.map((item) => ({
            ...item,
            isCurrentProvider: Boolean(currentProvider && item.provider === currentProvider),
            isCurrentModel:
                item.modelType === AiModelTypeEnum.LLM &&
                Boolean(currentCopilotId) &&
                item.copilotId === currentCopilotId &&
                item.model === currentModelId
        }))

        return {
            status: 'available',
            summary: decoratedItems.length
                ? currentProvider
                    ? `Found ${decoratedItems.length} available AI models. Current LLM provider is '${currentProvider}' and current model is '${currentModelId ?? 'unknown'}'.`
                    : `Found ${decoratedItems.length} available AI models across accessible providers.`
                : 'No AI copilot models are currently available.',
            total: decoratedItems.length,
            workspaceId: this.requireWorkspaceId(context),
            currentCopilotId,
            currentProvider,
            currentModelId,
            items: decoratedItems
        }
    }

    async getAvailableKnowledgebasesFromContext(
        context: AuthoringAssistantRequestContext
    ): Promise<AuthoringCatalogResult<KnowledgebaseCatalogItem>> {
        const workspaceId = this.requireWorkspaceId(context)
        if (!workspaceId) {
            return this.buildRejectedCatalogResult('Missing workspaceId in request context.')
        }

        const result = await this.knowledgebaseService.getAllByWorkspace(
            workspaceId,
            {} as any,
            false,
            RequestContext.currentUser()
        )
        const items = result.items.map((knowledgebase) => ({
            id: knowledgebase.id,
            name: knowledgebase.name,
            description: knowledgebase.description ?? null,
            status: knowledgebase.status ?? null,
            permission: knowledgebase.permission ?? null,
            language: knowledgebase.language ?? null,
            avatar: knowledgebase.avatar
        }))

        return this.buildCatalogResult(items, {
            workspaceId,
            emptySummary: `No knowledgebases are currently available in workspace '${workspaceId}'.`,
            foundSummary: `Found ${items.length} knowledgebases available in workspace '${workspaceId}'.`
        })
    }

    async getAvailableSkillsFromContext(
        context: AuthoringAssistantRequestContext
    ): Promise<AuthoringCatalogResult<SkillCatalogItem>> {
        const workspaceId = this.requireWorkspaceId(context)
        if (!workspaceId) {
            return this.buildRejectedCatalogResult('Missing workspaceId in request context.')
        }

        const skills = await this.queryBus.execute<ListWorkspaceSkillsQuery, ISkillPackage[]>(
            new ListWorkspaceSkillsQuery(workspaceId)
        )
        const items = skills.map((skill) => ({
            id: skill.id ?? null,
            name: skill.metadata?.name ?? skill.name ?? null,
            version: skill.metadata?.version ?? null,
            summary: this.pickI18nText(skill.metadata?.summary) ?? null,
            visibility: skill.visibility ?? null
        }))

        return this.buildCatalogResult(items, {
            workspaceId,
            emptySummary: `No skills are currently available in workspace '${workspaceId}'.`,
            foundSummary: `Found ${items.length} skills available in workspace '${workspaceId}'.`
        })
    }

    async newXpertFromContext(
        context: AuthoringAssistantRequestContext,
        payload: NewXpertPayload
    ): Promise<AssistantDraftMutationResult> {
        const trimmedIntent = payload?.userIntent?.trim()
        if (!trimmedIntent) {
            return this.buildRejectedResult('newXpert', 'Missing userIntent for workspace creation.', null, [
                this.createDiagnostic('request', 'Missing userIntent for workspace creation.')
            ])
        }

        const workspaceId = this.requireWorkspaceId(context)
        if (!workspaceId) {
            return this.buildRejectedResult('newXpert', 'Missing workspaceId for workspace creation.', null, [
                this.createDiagnostic('request', 'Missing workspaceId for workspace creation.')
            ])
        }

        const name = await this.createAvailableName(
            payload?.xpertName?.trim() || this.deriveNameFromIntent(trimmedIntent)
        )
        const agentKey = letterStartSUID('Agent_')
        const initialAgent = {
            key: agentKey,
            name,
            title: name,
            description: trimmedIntent,
            prompt: trimmedIntent,
            options: {
                vision: {
                    enabled: true
                }
            }
        }
        const created = await this.xpertService.create({
            type: XpertTypeEnum.Agent,
            name,
            title: name,
            description: trimmedIntent,
            latest: true,
            workspaceId,
            agent: initialAgent,
            graph: {
                nodes: [
                    {
                        type: 'agent',
                        key: agentKey,
                        position: { x: 0, y: 0 },
                        entity: initialAgent
                    }
                ],
                connections: []
            },
            copilotModel: {
                modelType: 'llm',
                model: 'gpt-4o'
            }
        } as Partial<IXpert>)

        // Reload the persisted team so the draft is built from the fully-hydrated
        // entity rather than the partial create() response.
        const persisted = await this.loadXpertById(created.id)
        const draft = this.buildInitialDraft(persisted)
        draft.savedAt = new Date()
        await this.xpertService.saveDraft(persisted.id, draft)

        return this.buildAppliedResult('newXpert', persisted.id, {
            summary: `Created "${persisted.title || persisted.name}" and opened it in Studio.`,
            syncMode: 'none',
            requiresRefresh: false,
            warnings: payload?.templateId ? ['templateId is reserved for a later phase and was ignored.'] : []
        })
    }

    async editXpertFromContext(
        context: AuthoringAssistantRequestContext,
        payload: EditXpertPayload,
        copilotModelCatalog: CopilotModelCatalogSnapshot | null = null
    ): Promise<AssistantDraftMutationResult> {
        const toolName: AuthoringToolName = 'editXpert'

        if (!context.targetXpertId) {
            return this.buildRejectedResult(toolName, 'Missing xpertId for Studio draft mutation.', null, [
                this.createDiagnostic('request', 'Missing xpertId for Studio draft mutation.')
            ])
        }

        const xpert = await this.loadXpertById(context.targetXpertId)
        const currentDraft = this.getEditableDraft(xpert)
        const currentDraftHash = this.calculateDraftHash(currentDraft)

        const trimmedDslYaml = payload?.dslYaml?.trim()
        if (!trimmedDslYaml) {
            return this.buildRejectedResult(toolName, 'Missing dslYaml for Studio draft mutation.', currentDraftHash, [
                this.createDiagnostic('request', 'Missing dslYaml for Studio draft mutation.')
            ])
        }

        let parsedDsl: Record<string, unknown>
        try {
            const parsed = yaml.parse(trimmedDslYaml)
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return this.buildRejectedResult(
                    toolName,
                    'Invalid YAML DSL provided for editXpert.',
                    currentDraftHash,
                    [this.createDiagnostic('yaml', 'Invalid YAML DSL provided for editXpert.')]
                )
            }

            parsedDsl = parsed as Record<string, unknown>
        } catch {
            return this.buildRejectedResult(toolName, 'Invalid YAML DSL provided for editXpert.', currentDraftHash, [
                this.createDiagnostic('yaml', 'Invalid YAML DSL provided for editXpert.')
            ])
        }

        let candidateDraft: TXpertTeamDraft
        try {
            candidateDraft = buildOverwriteDraftFromImportedDsl(xpert, parsedDsl as Partial<TXpertTeamDraft>)
        } catch (error) {
            return this.buildRejectedResult(
                toolName,
                error instanceof Error ? error.message : 'Invalid YAML DSL provided for editXpert.',
                currentDraftHash,
                [
                    this.createDiagnostic(
                        'yaml',
                        error instanceof Error ? error.message : 'Invalid YAML DSL provided for editXpert.'
                    )
                ]
            )
        }

        const restoredDraftIdentity = await this.restoreUnavailableDraftName(parsedDsl, currentDraft, xpert)
        if (restoredDraftIdentity.changed) {
            parsedDsl = restoredDraftIdentity.dslYaml

            try {
                candidateDraft = buildOverwriteDraftFromImportedDsl(xpert, parsedDsl as Partial<TXpertTeamDraft>)
            } catch (error) {
                return this.buildRejectedResult(
                    toolName,
                    error instanceof Error ? error.message : 'Invalid YAML DSL provided for editXpert.',
                    currentDraftHash,
                    [
                        this.createDiagnostic(
                            'yaml',
                            error instanceof Error ? error.message : 'Invalid YAML DSL provided for editXpert.'
                        )
                    ]
                )
            }
        }

        const ensuredCopilotModelCatalog = await this.ensureCopilotModelCatalogSnapshot(
            currentDraft,
            candidateDraft,
            context,
            copilotModelCatalog
        )
        if (ensuredCopilotModelCatalog.error) {
            return this.buildRejectedResult(toolName, ensuredCopilotModelCatalog.error, currentDraftHash, [
                this.createDiagnostic('model', ensuredCopilotModelCatalog.error, 'catalog')
            ])
        }
        const resolvedCopilotModelCatalog = ensuredCopilotModelCatalog.catalog

        const modelValidationErrors = this.validateDraftCopilotModelSelection(
            currentDraft,
            candidateDraft,
            context,
            resolvedCopilotModelCatalog
        )
        const copilotNormalization = this.normalizeDraftCopilotModelSelection(parsedDsl, resolvedCopilotModelCatalog)

        if (copilotNormalization.changed) {
            parsedDsl = copilotNormalization.dslYaml

            try {
                candidateDraft = buildOverwriteDraftFromImportedDsl(xpert, parsedDsl as Partial<TXpertTeamDraft>)
            } catch (error) {
                return this.buildRejectedResult(
                    toolName,
                    error instanceof Error ? error.message : 'Invalid YAML DSL provided for editXpert.',
                    currentDraftHash,
                    [
                        this.createDiagnostic(
                            'yaml',
                            error instanceof Error ? error.message : 'Invalid YAML DSL provided for editXpert.'
                        )
                    ]
                )
            }
        }

        const validationDiagnostics = await this.validateCandidateDraft(candidateDraft, xpert)
        const modelDiagnostics = this.uniqueDiagnostics([
            ...modelValidationErrors.map((message) => this.createDiagnostic('model', message, 'catalog')),
            ...copilotNormalization.errors.map((message) => this.createDiagnostic('model', message, 'catalog'))
        ])
        const combinedDiagnostics = this.uniqueDiagnostics([...modelDiagnostics, ...validationDiagnostics])

        if (combinedDiagnostics.length) {
            return this.buildRejectedResult(
                toolName,
                this.formatValidationSummary(combinedDiagnostics),
                currentDraftHash,
                combinedDiagnostics
            )
        }

        try {
            await this.commandBus.execute(new XpertImportCommand(parsedDsl, { targetXpertId: context.targetXpertId }))
        } catch (error) {
            return this.buildRejectedResult(
                toolName,
                error instanceof Error ? error.message : 'Failed to import YAML DSL for editXpert.',
                currentDraftHash,
                [
                    this.createDiagnostic(
                        'import',
                        error instanceof Error ? error.message : 'Failed to import YAML DSL for editXpert.'
                    )
                ]
            )
        }

        return this.buildAppliedResult(toolName, context.targetXpertId, {
            syncMode: 'refresh',
            requiresRefresh: true
        })
    }

    private async buildAppliedResult(
        toolName: AuthoringToolName,
        xpertId: string,
        options: {
            summary?: string
            syncMode: AssistantDraftMutationResult['syncMode']
            requiresRefresh: boolean
            warnings?: string[]
        }
    ): Promise<AssistantDraftMutationResult> {
        const xpert = await this.loadXpertById(xpertId)
        const savedDraft = this.getEditableDraft(xpert)
        const committedDraftHash = this.calculateDraftHash(savedDraft)

        return {
            status: 'applied',
            toolName,
            summary:
                options.summary ?? `Updated "${savedDraft.team?.title || savedDraft.team?.name || 'current draft'}".`,
            syncMode: options.syncMode,
            conflictType: null,
            requiresRefresh: options.requiresRefresh,
            committedDraftHash,
            updatedDraftFragment: this.buildUpdatedDraftFragment(savedDraft),
            dslYaml: await this.exportDraftDslYaml(xpertId),
            warnings: options.warnings ?? []
        }
    }

    private buildCatalogResult<T>(
        items: T[],
        options: {
            workspaceId?: string | null
            emptySummary: string
            foundSummary: string
        }
    ): AuthoringCatalogResult<T> {
        return {
            status: 'available',
            summary: items.length ? options.foundSummary : options.emptySummary,
            total: items.length,
            workspaceId: options.workspaceId ?? null,
            items
        }
    }

    private buildRejectedCatalogResult<T>(summary: string): AuthoringCatalogResult<T> {
        return {
            status: 'rejected',
            summary,
            total: 0,
            workspaceId: null,
            items: []
        }
    }

    private buildUpdatedDraftFragment(savedDraft: TXpertTeamDraft) {
        const primaryAgent = savedDraft.team?.agent

        return {
            team: {
                id: savedDraft.team?.id ?? null,
                name: savedDraft.team?.name ?? null,
                title: savedDraft.team?.title ?? null,
                description: savedDraft.team?.description ?? null,
                avatar: savedDraft.team?.avatar ?? null,
                starters: savedDraft.team?.starters ?? [],
                workspaceId: savedDraft.team?.workspaceId ?? null
            },
            primaryAgent: primaryAgent
                ? {
                      key: primaryAgent.key,
                      name: primaryAgent.name ?? null,
                      title: primaryAgent.title ?? null,
                      description: primaryAgent.description ?? null,
                      prompt: primaryAgent.prompt ?? null,
                      copilotModel: primaryAgent.copilotModel ?? null
                  }
                : null
        }
    }

    private async exportDraftDslYaml(xpertId: string) {
        const draftDsl = await this.commandBus.execute(new XpertExportCommand(xpertId, true, false))
        return yaml.stringify(instanceToPlain(draftDsl))
    }

    private requireWorkspaceId(context: AuthoringAssistantRequestContext) {
        const envWorkspaceId = typeof context.env?.['workspaceId'] === 'string' ? context.env['workspaceId'].trim() : ''
        if (envWorkspaceId) {
            return envWorkspaceId
        }

        const workspaceId = typeof context.workspaceId === 'string' ? context.workspaceId.trim() : ''
        return workspaceId || null
    }

    private async loadXpertById(xpertId?: string | null) {
        if (!xpertId) {
            throw new Error('Missing target Xpert id.')
        }

        const xpert = await this.xpertService.repository.findOne({
            where: {
                id: xpertId
            },
            relations: [
                'agent',
                'agent.copilotModel',
                'agent.copilotModel.copilot',
                'agent.copilotModel.copilot.copilotModel',
                'agent.copilotModel.copilot.modelProvider',
                'copilotModel',
                'copilotModel.copilot',
                'copilotModel.copilot.copilotModel',
                'copilotModel.copilot.modelProvider',
                'agents',
                'agents.copilotModel',
                'toolsets',
                'knowledgebases'
            ]
        })

        if (!xpert) {
            throw new Error(`Xpert '${xpertId}' was not found.`)
        }

        return xpert
    }

    private buildRejectedResult(
        toolName: AuthoringToolName,
        summary: string,
        committedDraftHash: string | null = null,
        diagnostics: AuthoringDiagnostic[] | null = null
    ): AssistantDraftMutationResult {
        return {
            status: 'rejected',
            toolName,
            summary,
            diagnostics,
            syncMode: 'none',
            conflictType: null,
            requiresRefresh: false,
            committedDraftHash,
            updatedDraftFragment: null,
            warnings: []
        }
    }

    private async validateCandidateDraft(
        draft: TXpertTeamDraft,
        currentXpert?: IXpert | null
    ): Promise<AuthoringDiagnostic[]> {
        const structuralErrors = this.validateGraphStructure(draft).map((message) =>
            this.createDiagnostic('validation', message, 'structure')
        )
        const authoringModelErrors = this.validateRequiredAuthoringModelConfigs(draft).map((message) =>
            this.createDiagnostic('model', message, 'structure')
        )
        let nameErrors: AuthoringDiagnostic[] = []
        let checklistErrors: AuthoringDiagnostic[] = []

        try {
            nameErrors = (await this.validateDraftName(draft, currentXpert)).map((message) =>
                this.createDiagnostic('validation', message, 'structure')
            )
        } catch (error) {
            nameErrors = [
                this.createDiagnostic(
                    'validation',
                    error instanceof Error ? error.message : 'Draft name validation failed.',
                    'structure'
                )
            ]
        }

        try {
            const checklist = await this.xpertService.validate(draft)
            checklistErrors = this.collectChecklistErrors(checklist).map((message) =>
                this.createDiagnostic('validation', message, 'checklist')
            )
        } catch (error) {
            checklistErrors = [
                this.createDiagnostic(
                    'validation',
                    error instanceof Error ? error.message : 'Draft checklist validation failed.',
                    'checklist'
                )
            ]
        }

        return this.uniqueDiagnostics([...structuralErrors, ...authoringModelErrors, ...nameErrors, ...checklistErrors])
    }

    private validateDraftCopilotModelSelection(
        currentDraft: TXpertTeamDraft,
        candidateDraft: TXpertTeamDraft,
        context: AuthoringAssistantRequestContext,
        copilotModelCatalog: CopilotModelCatalogSnapshot | null
    ) {
        const currentModelRefs = this.extractConfiguredModelSelections(currentDraft)
        const candidateModelRefs = this.extractConfiguredModelSelections(candidateDraft)

        if (!this.didConfiguredModelSelectionsChange(currentModelRefs, candidateModelRefs)) {
            return []
        }

        if (!context.targetXpertId) {
            return ['Draft model configuration changed, but the current Xpert context is missing.']
        }

        if (!copilotModelCatalog || copilotModelCatalog.targetXpertId !== context.targetXpertId) {
            return ['Draft model configuration changed. Call getAvailableCopilotModels before editXpert, then retry with a returned model id.']
        }

        return []
    }

    private normalizeDraftCopilotModelSelection(
        parsedDsl: Record<string, unknown>,
        copilotModelCatalog: CopilotModelCatalogSnapshot | null
    ): {
        changed: boolean
        dslYaml: Record<string, unknown>
        errors: string[]
    } {
        const catalogItems = copilotModelCatalog?.items
        if (!Array.isArray(catalogItems) || !catalogItems.length) {
            return {
                changed: false,
                dslYaml: parsedDsl,
                errors: []
            }
        }

        const targets = this.getModelConfigTargets(parsedDsl)
        let changed = false
        const errors: string[] = []

        for (const target of targets) {
            const normalization = this.normalizeCopilotModelConfig(target, copilotModelCatalog)
            if (normalization.error) {
                errors.push(normalization.error)
                continue
            }

            if (normalization.changed) {
                target.owner[target.key] = normalization.value
                changed = true
            }
        }

        return {
            changed,
            dslYaml: parsedDsl,
            errors: Array.from(new Set(errors))
        }
    }

    private getModelConfigTargets(root: Record<string, unknown>) {
        const targets: ModelConfigTarget[] = []
        const seen = new Set<string>()

        const visit = (value: unknown, path: string, context: ModelScanContext) => {
            if (Array.isArray(value)) {
                value.forEach((item, index) => visit(item, `${path}[${index}]`, context))
                return
            }

            const record = this.asRecord(value)
            if (!record) {
                return
            }

            for (const [key, child] of Object.entries(record)) {
                if (key === 'copilot' || key === 'modelProvider' || key === 'providerWithModels') {
                    continue
                }
                const childPath = path ? `${path}.${key}` : key
                const childRecord = this.asRecord(child)
                const childContext = this.extendModelScanContext(record, key, childRecord, context)

                if (childRecord && this.shouldTreatAsModelTarget(key, childRecord, childContext)) {
                    if (!seen.has(childPath)) {
                        targets.push({
                            owner: record,
                            key,
                            label: childPath,
                            expectedModelType: this.inferTargetModelType(childPath, key, childContext, childRecord),
                            requiredFeatures: this.inferTargetModelFeatures(key)
                        })
                        seen.add(childPath)
                    }
                }

                visit(child, childPath, childContext)
            }
        }

        visit(root, '', {})
        return targets
    }

    private normalizeCopilotModelConfig(
        target: ModelConfigTarget,
        copilotModelCatalog: CopilotModelCatalogSnapshot
    ): {
        changed: boolean
        value: Record<string, unknown>
        error: string | null
    } {
        const config = this.asRecord(target.owner[target.key])
        if (!config) {
            return {
                changed: false,
                value: {},
                error: null
            }
        }

        const model = typeof config['model'] === 'string' ? config['model'].trim() : ''
        if (!model) {
            return {
                changed: false,
                value: config,
                error: null
            }
        }

        const explicitCopilotId = typeof config['copilotId'] === 'string' ? config['copilotId'].trim() : ''
        const legacyCopilotId = typeof config['copilot'] === 'string' ? config['copilot'].trim() : ''
        const requestedCopilotId = explicitCopilotId || legacyCopilotId
        const targetModelType = this.resolveTargetModelType(target, config)
        const matchingItems = this.getCatalogItemsForTarget(copilotModelCatalog, target, targetModelType).filter(
            (item) => item.model === model
        )

        if (!matchingItems.length) {
            return {
                changed: false,
                value: config,
                error: this.buildUnavailableModelError(target.label, targetModelType, copilotModelCatalog, model)
            }
        }

        let resolvedItem: CopilotModelCatalogItem | undefined
        if (requestedCopilotId) {
            resolvedItem = matchingItems.find((item) => item.copilotId === requestedCopilotId)
            if (!resolvedItem) {
                return {
                    changed: false,
                    value: config,
                    error: `${target.label} uses model "${model}" with unavailable copilotId "${requestedCopilotId}". Call getAvailableCopilotModels and use the returned copilotId for that model.`
                }
            }
        } else {
            resolvedItem =
                (targetModelType === AiModelTypeEnum.LLM && copilotModelCatalog.currentCopilotId
                    ? matchingItems.find((item) => item.copilotId === copilotModelCatalog.currentCopilotId)
                    : undefined) ?? (matchingItems.length === 1 ? matchingItems[0] : undefined)

            if (!resolvedItem) {
                const candidateIds = Array.from(new Set(matchingItems.map((item) => item.copilotId))).join(', ')
                return {
                    changed: false,
                    value: config,
                    error: `${target.label} uses model "${model}" but does not specify a copilotId, and multiple copilotIds are available: ${candidateIds}. Call getAvailableCopilotModels and write the matching copilotId explicitly.`
                }
            }
        }

        const normalizedValue = {
            ...config,
            copilotId: resolvedItem.copilotId,
            model: resolvedItem.model,
            modelType:
                typeof config['modelType'] === 'string' && config['modelType'].trim()
                    ? config['modelType']
                    : targetModelType
        }
        delete normalizedValue['copilot']

        const changed =
            normalizedValue['copilotId'] !== config['copilotId'] ||
            normalizedValue['model'] !== config['model'] ||
            normalizedValue['modelType'] !== config['modelType'] ||
            Object.prototype.hasOwnProperty.call(config, 'copilot')

        return {
            changed,
            value: normalizedValue,
            error: null
        }
    }

    private asRecord(value: unknown): Record<string, unknown> | null {
        return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
    }

    private didConfiguredModelSelectionsChange(currentModelSelections: string[], candidateModelSelections: string[]) {
        if (currentModelSelections.length !== candidateModelSelections.length) {
            return true
        }

        return currentModelSelections.some((modelId, index) => modelId !== candidateModelSelections[index])
    }

    private extractConfiguredModelSelections(value: unknown) {
        const root = this.asRecord(value)
        if (!root) {
            return []
        }

        return this.getModelConfigTargets(root)
            .map((target) => {
                const config = this.asRecord(target.owner[target.key])
                if (!config) {
                    return null
                }

                const model = typeof config['model'] === 'string' ? config['model'].trim() : ''
                const modelType = typeof config['modelType'] === 'string' ? config['modelType'].trim() : ''
                const explicitCopilotId = typeof config['copilotId'] === 'string' ? config['copilotId'].trim() : ''
                const legacyCopilotId = typeof config['copilot'] === 'string' ? config['copilot'].trim() : ''

                return `${target.label}:${modelType}:${model}:${explicitCopilotId || legacyCopilotId}`
            })
            .filter((item): item is string => Boolean(item))
            .sort((left, right) => left.localeCompare(right))
    }

    private async ensureCopilotModelCatalogSnapshot(
        currentDraft: TXpertTeamDraft,
        candidateDraft: TXpertTeamDraft,
        context: AuthoringAssistantRequestContext,
        copilotModelCatalog: CopilotModelCatalogSnapshot | null
    ) {
        const scopedCatalog =
            copilotModelCatalog?.targetXpertId === (context.targetXpertId ?? null) ? copilotModelCatalog : null
        const currentModelSelections = this.extractConfiguredModelSelections(currentDraft)
        const candidateModelSelections = this.extractConfiguredModelSelections(candidateDraft)

        if (!this.didConfiguredModelSelectionsChange(currentModelSelections, candidateModelSelections)) {
            return {
                catalog: scopedCatalog,
                error: null
            }
        }

        if (scopedCatalog && Array.isArray(scopedCatalog.items)) {
            return {
                catalog: scopedCatalog,
                error: null
            }
        }

        try {
            const catalogResult = await this.getAvailableCopilotModelsFromContext(context)
            return {
                catalog: this.createCopilotModelCatalogSnapshot(context.targetXpertId ?? null, catalogResult),
                error: null
            }
        } catch (error) {
            return {
                catalog: null,
                error:
                    error instanceof Error
                        ? error.message
                        : 'Failed to resolve available copilot models for editXpert.'
            }
        }
    }

    private createCopilotModelCatalogSnapshot(
        targetXpertId: string | null,
        catalogResult: CopilotModelCatalogResult
    ): CopilotModelCatalogSnapshot {
        return {
            targetXpertId,
            currentCopilotId: catalogResult.currentCopilotId ?? null,
            currentProvider: catalogResult.currentProvider ?? null,
            currentModelId: catalogResult.currentModelId ?? null,
            availableModelIds: Array.from(new Set((catalogResult.items ?? []).map((item) => item.model))),
            items: catalogResult.items ?? []
        }
    }

    private async restoreUnavailableDraftName(
        parsedDsl: Record<string, unknown>,
        currentDraft: TXpertTeamDraft,
        currentXpert: IXpert
    ) {
        const team = this.asRecord(parsedDsl['team'])
        const currentName = typeof currentDraft?.team?.name === 'string' ? currentDraft.team.name.trim() : ''
        const nextName = typeof team?.['name'] === 'string' ? team['name'].trim() : ''

        if (!team || !currentName || !nextName || nextName === currentName) {
            return {
                changed: false,
                dslYaml: parsedDsl
            }
        }

        const nextSlug = convertToUrlPath(nextName)
        if (nextSlug === currentXpert.slug || (await this.xpertService.validateName(nextName))) {
            return {
                changed: false,
                dslYaml: parsedDsl
            }
        }

        team['name'] = currentName

        const currentTitle = typeof currentDraft?.team?.title === 'string' ? currentDraft.team.title : ''
        const nextTitle = typeof team['title'] === 'string' ? team['title'].trim() : ''
        if (currentTitle && (!nextTitle || nextTitle === nextName)) {
            team['title'] = currentTitle
        }

        return {
            changed: true,
            dslYaml: parsedDsl
        }
    }

    private extendModelScanContext(
        record: Record<string, unknown>,
        key: string,
        child: Record<string, unknown> | null,
        context: ModelScanContext
    ): ModelScanContext {
        if (key === 'entity' && child) {
            const nodeType = typeof record['type'] === 'string' ? record['type'] : context.nodeType
            return {
                ...context,
                nodeKey: typeof record['key'] === 'string' ? record['key'] : context.nodeKey,
                nodeType,
                workflowEntityType: typeof child['type'] === 'string' ? child['type'] : context.workflowEntityType,
                middlewareProvider: typeof child['provider'] === 'string' ? child['provider'] : context.middlewareProvider
            }
        }

        if (key === 'options' && context.workflowEntityType === WorkflowNodeTypeEnum.MIDDLEWARE) {
            return {
                ...context
            }
        }

        return context
    }

    private shouldTreatAsModelTarget(
        key: string,
        value: Record<string, unknown>,
        context: ModelScanContext
    ) {
        if (key === 'model') {
            return this.isCopilotModelConfig(value) || context.workflowEntityType === WorkflowNodeTypeEnum.MIDDLEWARE
        }

        if (key.endsWith('Model')) {
            return true
        }

        return false
    }

    private inferTargetModelType(
        label: string,
        key: string,
        context: ModelScanContext,
        value: Record<string, unknown>
    ): AiModelTypeEnum {
        const explicitModelType =
            typeof value['modelType'] === 'string' && value['modelType'].trim()
                ? (value['modelType'] as AiModelTypeEnum)
                : null
        if (explicitModelType) {
            return explicitModelType
        }

        if (key === 'rerankModel') {
            return AiModelTypeEnum.RERANK
        }

        if (key === 'embeddingModel') {
            return AiModelTypeEnum.TEXT_EMBEDDING
        }

        if (key === 'visionModel') {
            return AiModelTypeEnum.LLM
        }

        if (label.includes('speechToText.copilotModel')) {
            return AiModelTypeEnum.SPEECH2TEXT
        }

        if (label.includes('textToSpeech.copilotModel')) {
            return AiModelTypeEnum.TTS
        }

        if (key === 'copilotModel') {
            if (
                context.nodeType === 'knowledge' ||
                context.workflowEntityType === WorkflowNodeTypeEnum.KNOWLEDGE_BASE ||
                context.workflowEntityType === 'knowledge-base' ||
                label.includes('knowledgebases[')
            ) {
                return AiModelTypeEnum.TEXT_EMBEDDING
            }
        }

        return AiModelTypeEnum.LLM
    }

    private inferTargetModelFeatures(key: string): ModelFeature[] {
        if (key === 'visionModel') {
            return [ModelFeature.VISION]
        }

        return []
    }

    private resolveTargetModelType(target: ModelConfigTarget, config: Record<string, unknown>) {
        const explicitModelType =
            typeof config['modelType'] === 'string' && config['modelType'].trim()
                ? (config['modelType'] as AiModelTypeEnum)
                : null
        return explicitModelType ?? target.expectedModelType
    }

    private getCatalogItemsForTarget(
        copilotModelCatalog: CopilotModelCatalogSnapshot,
        target: ModelConfigTarget,
        modelType: AiModelTypeEnum
    ) {
        const catalogItems = Array.isArray(copilotModelCatalog.items) ? copilotModelCatalog.items : []
        return catalogItems.filter((item) => {
            if (item.modelType !== modelType) {
                return false
            }

            if (!target.requiredFeatures.length) {
                return true
            }

            const itemFeatures = item.features ?? []
            return target.requiredFeatures.every((feature) => itemFeatures.includes(feature))
        })
    }

    private buildUnavailableModelError(
        label: string,
        modelType: AiModelTypeEnum,
        copilotModelCatalog: CopilotModelCatalogSnapshot,
        model: string
    ) {
        const matchingItems = (copilotModelCatalog.items ?? []).filter((item) => item.modelType === modelType)
        const providerLabel = copilotModelCatalog.currentProvider ? ` for provider '${copilotModelCatalog.currentProvider}'` : ''
        const allowedModelIdList =
            Array.from(new Set(matchingItems.map((item) => item.model))).join(', ') || 'none'

        return `${label} uses unavailable ${modelType} model id "${model}"${providerLabel}. Call getAvailableCopilotModels and use one of: ${allowedModelIdList}.`
    }

    private isCopilotModelConfig(value: Record<string, unknown>): value is { model: string } {
        return (
            typeof value === 'object' &&
            !Array.isArray(value) &&
            ('model' in value ||
                'copilotId' in value ||
                'copilot' in value ||
                'modelType' in value ||
                'options' in value)
        )
    }

    private validateRequiredAuthoringModelConfigs(draft: TXpertTeamDraft) {
        const errors: string[] = []
        const team = this.asRecord(draft?.team)
        const features = team ? this.asRecord(team['features']) : null
        const speechToText = features ? this.asRecord(features['speechToText']) : null
        const textToSpeech = features ? this.asRecord(features['textToSpeech']) : null

        if (speechToText?.['enabled']) {
            const sttModel = this.asRecord(speechToText['copilotModel'])
            if (!sttModel || typeof sttModel['model'] !== 'string' || !sttModel['model'].trim()) {
                errors.push('team.features.speechToText is enabled and must specify a speech-to-text model.')
            }
        }

        if (textToSpeech?.['enabled']) {
            const ttsModel = this.asRecord(textToSpeech['copilotModel'])
            if (!ttsModel || typeof ttsModel['model'] !== 'string' || !ttsModel['model'].trim()) {
                errors.push('team.features.textToSpeech is enabled and must specify a text-to-speech model.')
            }
        }

        for (const node of draft.nodes ?? []) {
            if (node?.type !== 'workflow') {
                continue
            }

            const entity = this.asRecord(node.entity)
            if (!entity || entity['type'] !== WorkflowNodeTypeEnum.MIDDLEWARE) {
                continue
            }

            if (entity['provider'] !== 'SummarizationMiddleware') {
                continue
            }

            const options = this.asRecord(entity['options'])
            const model = options ? this.asRecord(options['model']) : null
            if (!model || typeof model['model'] !== 'string' || !model['model'].trim()) {
                errors.push(`middleware node "${node.key}" uses SummarizationMiddleware and must specify options.model.`)
            }
        }

        return errors
    }

    private validateGraphStructure(draft: TXpertTeamDraft) {
        const errors: string[] = []
        const nodeKeys = new Set<string>()
        const connectionKeys = new Set<string>()
        const nodes = draft.nodes ?? []

        for (const node of nodes) {
            const nodeKey = typeof node?.key === 'string' ? node.key.trim() : ''
            if (!nodeKey) {
                errors.push('Node key cannot be empty.')
            } else if (nodeKeys.has(nodeKey)) {
                errors.push(`Duplicate node key "${nodeKey}".`)
            } else {
                nodeKeys.add(nodeKey)
            }

            if (!VALID_NODE_TYPES.has(node?.type)) {
                errors.push(`Node "${nodeKey || '(empty)'}" has unsupported type "${String(node?.type ?? '')}".`)
            }

            if (node?.type === 'workflow') {
                const workflowType = node.entity?.type
                if (!VALID_WORKFLOW_NODE_TYPES.has(workflowType)) {
                    errors.push(
                        `Workflow node "${nodeKey || '(empty)'}" has unsupported entity.type "${String(workflowType ?? '')}".`
                    )
                }
            }
        }

        for (const connection of draft.connections ?? []) {
            const connectionKey = typeof connection?.key === 'string' ? connection.key.trim() : ''
            const from = typeof connection?.from === 'string' ? connection.from.trim() : ''
            const to = typeof connection?.to === 'string' ? connection.to.trim() : ''

            if (!connectionKey) {
                errors.push('Connection key cannot be empty.')
            } else if (connectionKeys.has(connectionKey)) {
                errors.push(`Duplicate connection key "${connectionKey}".`)
            } else {
                connectionKeys.add(connectionKey)
            }

            if (!from) {
                errors.push(`Connection "${connectionKey || '(empty)'}" is missing a source.`)
            }
            if (!to) {
                errors.push(`Connection "${connectionKey || '(empty)'}" is missing a target.`)
            }
            if (!VALID_CONNECTION_TYPES.has(connection?.type)) {
                errors.push(
                    `Connection "${connectionKey || '(empty)'}" has unsupported type "${String(connection?.type ?? '')}".`
                )
            }

            const sourceNode = this.findSourceNode(nodes, from)
            if (!sourceNode) {
                errors.push(
                    `Connection "${connectionKey || '(empty)'}" references missing source node "${from || '(empty)'}".`
                )
            }

            const targetNode = nodes.find((node) => node.key === to)
            if (!targetNode) {
                errors.push(
                    `Connection "${connectionKey || '(empty)'}" references missing target node "${to || '(empty)'}".`
                )
            }

            if (sourceNode && !this.supportsSourceConnection(sourceNode, connection.type)) {
                errors.push(
                    `Connection "${connectionKey || '(empty)'}" uses unsupported source "${from}" for type "${connection.type}".`
                )
            }

            if (targetNode && !this.supportsTargetConnection(targetNode, connection.type)) {
                errors.push(
                    `Connection "${connectionKey || '(empty)'}" targets "${to}" with unsupported type "${connection.type}".`
                )
            }
        }

        return errors
    }

    private findSourceNode(nodes: TXpertTeamNode[], from: string) {
        if (!from) {
            return null
        }

        const [sourceNodeKey] = from.split('/')
        return nodes.find((node) => node.key === sourceNodeKey) ?? null
    }

    private supportsSourceConnection(node: TXpertTeamNode, connectionType: TXpertTeamConnection['type']) {
        if (node.type === 'agent') {
            return true
        }

        if (node.type === 'knowledge' || node.type === 'toolset') {
            return false
        }

        if (node.type === 'xpert') {
            return connectionType === 'edge'
        }

        const workflowType = node.entity?.type
        if (!VALID_WORKFLOW_NODE_TYPES.has(workflowType)) {
            return false
        }

        if (connectionType === 'edge') {
            return !WORKFLOW_EDGE_OUTPUT_DISABLED_TYPES.has(workflowType)
        }

        if (connectionType === 'agent') {
            return WORKFLOW_AGENT_OUTPUT_TYPES.has(workflowType)
        }

        if (connectionType === 'xpert') {
            return WORKFLOW_XPERT_OUTPUT_TYPES.has(workflowType)
        }

        return false
    }

    private supportsTargetConnection(node: TXpertTeamNode, connectionType: TXpertTeamConnection['type']) {
        if (connectionType === 'edge') {
            if (node.type === 'agent' || node.type === 'xpert') {
                return true
            }

            if (node.type !== 'workflow') {
                return false
            }

            const workflowType = node.entity?.type
            return VALID_WORKFLOW_NODE_TYPES.has(workflowType) && !WORKFLOW_EDGE_INPUT_DISABLED_TYPES.has(workflowType)
        }

        if (connectionType !== node.type) {
            return false
        }

        if (node.type !== 'workflow') {
            return true
        }

        const workflowType = node.entity?.type
        return VALID_WORKFLOW_NODE_TYPES.has(workflowType) && WORKFLOW_TOP_INPUT_TYPES.has(workflowType)
    }

    private collectChecklistErrors(items: ChecklistItem[] = []) {
        return items
            .filter((item) => item?.level === 'error')
            .map((item) => this.getChecklistMessage(item))
            .filter((message): message is string => Boolean(message))
    }

    private getChecklistMessage(item: ChecklistItem) {
        if (typeof item?.message === 'string') {
            return item.message
        }

        return item?.message?.en_US ?? item?.message?.zh_Hans ?? null
    }

    private formatValidationSummary(diagnostics: AuthoringDiagnostic[]) {
        if (!diagnostics.length) {
            return 'Draft validation failed for editXpert.'
        }

        const preview = diagnostics
            .slice(0, 3)
            .map((diagnostic) => diagnostic.message)
            .join(' | ')

        return diagnostics.length > 3
            ? `Draft validation failed with ${diagnostics.length} issues: ${preview}`
            : `Draft validation failed with ${diagnostics.length} issues: ${preview}`
    }

    private createDiagnostic(
        kind: AuthoringDiagnostic['kind'],
        message: string,
        source: AuthoringDiagnostic['source'] = null
    ): AuthoringDiagnostic {
        return {
            kind,
            source,
            message
        }
    }

    private uniqueDiagnostics(diagnostics: AuthoringDiagnostic[]) {
        return diagnostics.filter(
            (diagnostic, index, list) =>
                list.findIndex(
                    (candidate) =>
                        candidate.kind === diagnostic.kind &&
                        candidate.source === diagnostic.source &&
                        candidate.message === diagnostic.message
                ) === index
        )
    }

    private throwConflict(
        toolName: AuthoringToolName,
        conflictType: AuthoringConflictType,
        summary: string,
        options: {
            requiresRefresh: boolean
            committedDraftHash: string | null
        }
    ): never {
        throw new AssistantDraftConflictError(
            toolName,
            conflictType,
            summary,
            options.requiresRefresh,
            options.committedDraftHash
        )
    }

    private buildInitialDraft(xpert: IXpert): TXpertTeamDraft {
        const nodes = (xpert.graph?.nodes ?? createXpertNodes(xpert, { x: 0, y: 0 }).nodes).map((node) => ({
            ...node,
            hash: this.calculateNodeHashWithoutHash(node)
        }))
        const connections = xpert.graph?.connections ?? createAgentConnections(xpert.agent, xpert.executors ?? [])

        return {
            team: {
                ...omitXpertRelations(xpert),
                agent: xpert.agent
            } as TXpertTeamDraft['team'],
            nodes,
            connections
        }
    }

    private getEditableDraft(xpert: IXpert) {
        return xpert.draft ? structuredClone(xpert.draft) : this.buildInitialDraft(xpert)
    }

    private deriveNameFromIntent(userIntent: string) {
        const compact = userIntent
            .replace(/\s+/g, ' ')
            .replace(/[^\p{L}\p{N}\s-]/gu, '')
            .trim()

        return compact.slice(0, 48) || 'New Expert'
    }

    private async createAvailableName(baseName: string) {
        const normalized = baseName.trim() || 'New Expert'
        if (await this.xpertService.validateName(normalized)) {
            return normalized
        }

        for (let index = 2; index < 100; index++) {
            const candidate = `${normalized}-${index}`
            if (await this.xpertService.validateName(candidate)) {
                return candidate
            }
        }

        return `${normalized}-${Date.now()}`
    }

    private calculateNodeHash(value: unknown) {
        return createHash('sha256').update(JSON.stringify(value)).digest('hex')
    }

    private calculateNodeHashWithoutHash<T extends { hash?: string }>(node: T) {
        const { hash: _hash, ...rest } = node
        return this.calculateNodeHash(rest)
    }

    private async validateDraftName(draft: TXpertTeamDraft, currentXpert?: IXpert | null) {
        const name = typeof draft?.team?.name === 'string' ? draft.team.name.trim() : ''
        if (!name) {
            return []
        }

        const nextSlug = convertToUrlPath(name)
        if (currentXpert && nextSlug === currentXpert.slug) {
            return []
        }

        return (await this.xpertService.validateName(name)) ? [] : ['Xpert name is invalid or already in use']
    }

    private calculateDraftHash(draft: TXpertTeamDraft) {
        return createHash('sha256').update(JSON.stringify(draft)).digest('hex')
    }

    private pickI18nText(value: unknown): string | null {
        if (!value) {
            return null
        }

        if (typeof value === 'string') {
            return value
        }

        if (typeof value !== 'object' || Array.isArray(value)) {
            return null
        }

        const entries = Object.values(value as Record<string, unknown>).filter(
            (item): item is string => typeof item === 'string' && Boolean(item.trim())
        )

        return entries[0] ?? null
    }

    private async getCurrentCopilotModelSelection(xpertId: string) {
        const xpert = await this.loadXpertById(xpertId)
        const copilotModel = xpert.agent?.copilotModel ?? xpert.copilotModel
        const copilotId = copilotModel?.copilotId?.trim() || null
        const provider = copilotModel?.copilot?.modelProvider?.providerName ?? null
        const model = copilotModel?.model?.trim() || copilotModel?.copilot?.copilotModel?.model?.trim() || null

        if (!copilotId && !provider && !model) {
            return null
        }

        return {
            copilotId,
            provider,
            model
        }
    }
}
