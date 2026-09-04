import { randomUUID } from 'crypto'
import {
    createRuntimeSkillCapabilityId,
    figureOutXpert,
    getAgentMiddlewareNodes,
    IChatConversation,
    IWFNMiddleware,
    IXpert,
    IXpertAgentExecution,
    normalizeMiddlewareProvider,
    TChatConversationStatus,
    TChatRequest,
    XpertAgentExecutionStatusEnum
} from '@xpert-ai/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
    AgentMiddlewareAssistantTaskCancelResult,
    AgentMiddlewareAssistantTaskFile,
    AgentMiddlewareAssistantTaskInput,
    AgentMiddlewareAssistantTaskResult,
    AgentMiddlewareAssistantTaskStatus,
    AgentMiddlewareAssistantTaskStatusInput,
    AgentMiddlewareCorrelatedExecution,
    AgentMiddlewareExternalAssistantBinding,
    AgentMiddlewareListCorrelatedExecutionsInput,
    AgentMiddlewareListExternalAssistantBindingsInput,
    CancelConversationCommand,
    RequestContext
} from '@xpert-ai/plugin-sdk'
import { Observable } from 'rxjs'
import { In } from 'typeorm'
import { GetChatConversationQuery } from '../../../chat-conversation/queries/conversation-get.query'
import { ChatConversationUpsertCommand } from '../../../chat-conversation/commands/upsert.command'
import { ResolveRuntimeSkillPackagesQuery } from '../../../skill-package/queries/resolve-runtime-skill-packages.query'
import { SKILLS_MIDDLEWARE_NAME } from '../../../skill-package/types'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands/upsert.command'
import { FindAgentExecutionsQuery } from '../../../xpert-agent-execution/queries/find.query'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution/queries/get-one.query'
import {
    describeExternalAssistantBinding,
    directExternalAssistantIds,
    matchesExternalAssistantExpectation,
    safeExternalAssistantBinding,
    type ResolvedExternalAssistantBinding
} from '../../../xpert/external-assistant-binding'
import { XpertChatCommand } from '../../../xpert/commands/chat.command'
import { FindXpertQuery } from '../../../xpert/queries/get-one.query'
import { normalizeOptionalString } from './utils'

@Injectable()
export class AgentMiddlewareAssistantTaskRuntimeService {
    readonly #logger = new Logger(AgentMiddlewareAssistantTaskRuntimeService.name)

    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus
    ) {}

    async getAssistantTaskStatus(
        input: AgentMiddlewareAssistantTaskStatusInput
    ): Promise<AgentMiddlewareAssistantTaskResult | null> {
        const execution = await this.findAssistantTaskExecution(input)
        const conversation = await this.findAssistantTaskConversation(input)
        if (!execution && !conversation) {
            return null
        }

        return {
            status: execution
                ? mapExecutionStatusToTaskStatus(execution.status)
                : mapConversationStatusToTaskStatus(conversation?.status),
            taskId: normalizeOptionalString(input.taskId),
            executionId: execution?.id ?? normalizeOptionalString(input.executionId),
            conversationId: conversation?.id ?? normalizeOptionalString(input.conversationId),
            threadId: execution?.threadId ?? conversation?.threadId ?? normalizeOptionalString(input.threadId),
            errorMessage: execution?.error ?? conversation?.error
        }
    }

    /** Re-resolve the published graph so required-edge changes take effect without persisted instance IDs. */
    async listExternalAssistantBindings(
        input: AgentMiddlewareListExternalAssistantBindingsInput
    ): Promise<AgentMiddlewareExternalAssistantBinding[]> {
        return (await this.resolveExternalAssistantBindings(input.requesterXpertId, input.requesterAgentKey)).map(
            safeExternalAssistantBinding
        )
    }

    /** Limit reconciliation to requester-owned runs from currently bound external Assistants. */
    async listCorrelatedAssistantExecutions(
        input: AgentMiddlewareListCorrelatedExecutionsInput
    ): Promise<AgentMiddlewareCorrelatedExecution[]> {
        const bindings = (
            await this.resolveExternalAssistantBindings(input.requesterXpertId, input.requesterAgentKey)
        ).filter((binding) => binding.status === 'available')
        if (!bindings.length) return []
        const bindingByXpertId = new Map(bindings.map((binding) => [binding.xpertId, binding]))
        const result = await this.queryBus.execute<FindAgentExecutionsQuery, { items: IXpertAgentExecution[] }>(
            new FindAgentExecutionsQuery({
                where: { xpertId: In([...bindingByXpertId.keys()]) } as never,
                order: { createdAt: 'DESC' },
                take: Math.min(Math.max(input.limit ?? 100, 1), 200)
            })
        )
        return (result.items ?? []).flatMap((execution) => {
            const metadata = execution.metadata
            const inputRecord =
                execution.inputs && typeof execution.inputs === 'object' && !Array.isArray(execution.inputs)
                    ? execution.inputs
                    : undefined
            const correlation =
                metadata && typeof metadata === 'object' && !Array.isArray(metadata)
                    ? (readJsonRecordOrString(metadata, 'correlation') ??
                      (inputRecord ? readJsonRecordOrString(inputRecord, 'executionCorrelation') : undefined))
                    : inputRecord
                      ? readJsonRecordOrString(inputRecord, 'executionCorrelation')
                      : undefined
            if (metadata?.['requesterXpertId'] !== input.requesterXpertId || !correlation) return []
            const namespace = readRecordString(correlation, 'namespace')
            const operationId = readRecordString(correlation, 'operationId')
            const subjectId = readRecordString(correlation, 'subjectId')
            if (
                namespace !== input.namespace ||
                subjectId !== input.subjectId ||
                !operationId ||
                !execution.id ||
                !execution.xpertId
            )
                return []
            const binding = bindingByXpertId.get(execution.xpertId)
            if (!binding) return []
            const correlationAttributes = readJsonRecordOrString(correlation, 'attributes')
            const flowExecution = inputRecord ? readJsonRecordOrString(inputRecord, 'flowExecution') : undefined
            const envelopeMatchesCorrelation =
                flowExecution &&
                readRecordString(flowExecution, 'operationId') === operationId &&
                readRecordString(flowExecution, 'caseId') === subjectId
            // Chat collaborator calls already persist their structured inputs on
            // the child execution. Treat the governed flowExecution envelope as
            // the canonical correlation attributes when the caller did not
            // redundantly copy those fields into executionCorrelation.attributes.
            const attributes = correlationAttributes ?? (envelopeMatchesCorrelation ? flowExecution : undefined)
            return [
                {
                    operationId,
                    subjectId,
                    ...(attributes ? { attributes } : {}),
                    status: mapExecutionStatusToTaskStatus(execution.status),
                    executionId: execution.id,
                    ...(execution.parentId ? { parentExecutionId: execution.parentId } : {}),
                    ...(execution.threadId ? { threadId: execution.threadId } : {}),
                    executorXpertId: execution.xpertId,
                    ...(execution.agentKey || binding.primaryAgentKey
                        ? { executorAgentKey: execution.agentKey ?? binding.primaryAgentKey }
                        : {}),
                    ...(binding.templateSource?.templateKey
                        ? { executorAssistantTemplateKey: binding.templateSource.templateKey }
                        : {}),
                    ...(binding.title ? { executorAssistantTitle: binding.title } : {}),
                    ...(binding.publishedVersion ? { executorPublishedVersion: binding.publishedVersion } : {}),
                    ...(dateString(execution.createdAt) ? { startedAt: dateString(execution.createdAt) } : {}),
                    ...(dateString(execution.updatedAt) ? { updatedAt: dateString(execution.updatedAt) } : {})
                }
            ]
        })
    }

    async cancelAssistantTask(
        input: AgentMiddlewareAssistantTaskStatusInput
    ): Promise<AgentMiddlewareAssistantTaskCancelResult> {
        const result = await this.commandBus.execute<
            CancelConversationCommand,
            { canceledExecutionIds?: string[] } | undefined
        >(
            new CancelConversationCommand({
                conversationId: normalizeOptionalString(input.conversationId),
                threadId: normalizeOptionalString(input.threadId),
                executionId: normalizeOptionalString(input.executionId)
            })
        )

        return {
            canceledExecutionIds: result?.canceledExecutionIds ?? []
        }
    }

    /** Starts a task on the current Assistant or one deterministically resolved external Assistant. */
    async startAssistantTask(input: AgentMiddlewareAssistantTaskInput): Promise<AgentMiddlewareAssistantTaskResult> {
        const requesterXpertId = normalizeOptionalString(input.xpertId)
        const prompt = normalizeOptionalString(input.prompt)
        if (!requesterXpertId) {
            throw new Error('xpertId is required to start an assistant task')
        }
        if (!prompt) {
            throw new Error('prompt is required to start an assistant task')
        }

        if (input.target && input.target.requesterXpertId !== requesterXpertId) {
            throw new Error('External Assistant requester must match xpertId')
        }
        // Reject invalid or ambiguous bindings before creating conversation or execution rows.
        const externalBinding = input.target ? await this.resolveExternalAssistantTarget(input.target) : undefined
        const xpertId = externalBinding?.xpertId ?? requesterXpertId
        const agentKey = externalBinding?.primaryAgentKey ?? normalizeOptionalString(input.agentKey)
        const executionAssistant = externalBinding ?? (await this.resolveAssistantExecutionDescriptor(xpertId))

        // Resolve portable plugin skill references before creating any task rows.
        // This keeps invalid or cross-Agent selections from leaving partial runs.
        const resolvedAssistantTaskSkillSelection = await this.resolveAssistantTaskSkillSelection(
            xpertId,
            agentKey,
            input.selectedSkillRefs
        )
        const projectId = normalizeOptionalString(input.projectId)
        // Project-bound runs use source-aware runtime capability IDs so the
        // Skills Middleware can distinguish Assistant-owned workspace skills
        // from skills installed directly in the Project. Portable plugin refs
        // always resolve through the target Assistant's Skills Middleware.
        const assistantTaskSkillSelection =
            resolvedAssistantTaskSkillSelection && projectId
                ? {
                      ...resolvedAssistantTaskSkillSelection,
                      skillIds: resolvedAssistantTaskSkillSelection.skillIds.map((skillId) =>
                          createRuntimeSkillCapabilityId({ type: 'xpert', ownerId: xpertId, skillId })
                      )
                  }
                : resolvedAssistantTaskSkillSelection

        const requestedTaskId = normalizeOptionalString(input.taskId)
        const taskId = requestedTaskId ?? randomUUID()
        const conversationId = normalizeOptionalString(input.conversationId) ?? randomUUID()
        const executionId = normalizeOptionalString(input.executionId) ?? randomUUID()
        const conversation = await this.commandBus.execute<ChatConversationUpsertCommand, IChatConversation>(
            new ChatConversationUpsertCommand({
                id: conversationId,
                createdById: RequestContext.currentUserId(),
                status: 'busy',
                xpertId,
                from: 'job',
                projectId,
                options: {
                    parameters: {
                        input: prompt
                    }
                },
                ...(requestedTaskId ? { taskId: requestedTaskId } : {})
            })
        )
        const execution = await this.commandBus.execute<XpertAgentExecutionUpsertCommand, IXpertAgentExecution>(
            new XpertAgentExecutionUpsertCommand({
                id: executionId,
                xpertId,
                agentKey,
                status: XpertAgentExecutionStatusEnum.RUNNING,
                threadId: conversation.threadId,
                metadata: {
                    from: 'job',
                    requesterXpertId,
                    ...(input.correlation ? { correlation: input.correlation } : {})
                }
            })
        )
        const request: TChatRequest = {
            action: 'send',
            conversationId: conversation.id,
            ...(projectId ? { projectId } : {}),
            message: {
                clientMessageId: normalizeOptionalString(input.clientMessageId) ?? `assistant-task:${taskId}`,
                input: {
                    ...(input.humanInput ?? {}),
                    input: prompt,
                    files: normalizeTaskFiles(input.files)
                }
            }
        }

        const stream = await this.commandBus.execute<XpertChatCommand, Observable<MessageEvent>>(
            new XpertChatCommand(request, {
                xpertId,
                agentKey,
                from: 'job',
                ...(requestedTaskId ? { taskId: requestedTaskId } : {}),
                projectId: projectId ?? undefined,
                context: input.context,
                ...(assistantTaskSkillSelection ? { assistantTaskSkillSelection } : {}),
                execution: { id: execution.id },
                streamPersistence: {
                    transport: 'redis-stream',
                    threadId: conversation.threadId,
                    runId: execution.id
                }
            })
        )

        stream.subscribe({
            error: (error) =>
                this.#logger.error(
                    `Assistant task stream failed (${error instanceof Error ? error.name : 'UnknownError'})`
                ),
            complete: () => undefined
        })

        return {
            status: 'running',
            taskId,
            conversationId: conversation.id,
            threadId: conversation.threadId,
            executionId: execution.id,
            executorXpertId: xpertId,
            ...(agentKey ? { executorAgentKey: agentKey } : {}),
            ...(executionAssistant?.templateSource?.templateKey
                ? { executorAssistantTemplateKey: executionAssistant.templateSource.templateKey }
                : {}),
            ...(executionAssistant?.title ? { executorAssistantTitle: executionAssistant.title } : {}),
            ...(executionAssistant?.publishedVersion
                ? { executorPublishedVersion: executionAssistant.publishedVersion }
                : {})
        }
    }

    /** Resolves optional display metadata for the actual execution Assistant. */
    private async resolveAssistantExecutionDescriptor(xpertId: string) {
        try {
            const xpert = await this.queryBus.execute<FindXpertQuery, IXpert>(
                new FindXpertQuery({ id: xpertId }, { relations: ['agent'] })
            )
            return describeExternalAssistantBinding(xpert, xpert)
        } catch {
            return undefined
        }
    }

    /** Require exactly one same-organization, published Assistant matching template and Agent identity. */
    private async resolveExternalAssistantTarget(
        target: NonNullable<AgentMiddlewareAssistantTaskInput['target']>
    ): Promise<ResolvedExternalAssistantBinding> {
        const bindings = await this.resolveExternalAssistantBindings(target.requesterXpertId, target.requesterAgentKey)
        const matching = bindings.filter((binding) => matchesExternalAssistantExpectation(binding, target.expectation))
        if (matching.length > 1) {
            throw new Error('assistant_binding_ambiguous')
        }
        const binding = matching[0]
        if (!binding) {
            const unpublished = bindings.some(
                (candidate) =>
                    candidate.status === 'unpublished' &&
                    candidate.templateSource?.templateKey === target.expectation.templateKey &&
                    candidate.primaryAgentKey === target.expectation.agentKey
            )
            const nearMatch = bindings.some(
                (candidate) =>
                    candidate.templateSource?.templateKey === target.expectation.templateKey ||
                    candidate.primaryAgentKey === target.expectation.agentKey
            )
            throw new Error(
                unpublished
                    ? 'assistant_unpublished'
                    : nearMatch
                      ? 'assistant_binding_incompatible'
                      : 'assistant_binding_missing'
            )
        }
        if (binding.status === 'unpublished') throw new Error('assistant_unpublished')
        if (binding.status !== 'available') throw new Error('assistant_binding_incompatible')
        return binding
    }

    /** The requester primary Agent is the trust anchor; nested and optional Xpert edges are excluded. */
    private async resolveExternalAssistantBindings(
        requesterXpertIdValue: string,
        requesterAgentKeyValue: string
    ): Promise<ResolvedExternalAssistantBinding[]> {
        const requesterXpertId = normalizeOptionalString(requesterXpertIdValue)
        const requesterAgentKey = normalizeOptionalString(requesterAgentKeyValue)
        if (!requesterXpertId || !requesterAgentKey) return []
        const requester = await this.queryBus.execute<FindXpertQuery, IXpert>(
            new FindXpertQuery({ id: requesterXpertId }, { relations: ['agent'] })
        )
        if (requester.agent?.key !== requesterAgentKey) return []
        const targetIds = directExternalAssistantIds(requester, requesterAgentKey)
        const candidates = await Promise.all(
            targetIds.map(async (id) => {
                try {
                    return await this.queryBus.execute<FindXpertQuery, IXpert>(
                        new FindXpertQuery({ id }, { relations: ['agent'] })
                    )
                } catch {
                    return null
                }
            })
        )
        return candidates
            .filter((candidate): candidate is IXpert => Boolean(candidate))
            .map((candidate) => describeExternalAssistantBinding(requester, candidate))
    }

    /**
     * Resolves portable plugin skill identities to workspace-local package IDs
     * only after proving that the target Agent directly owns those skills.
     */
    private async resolveAssistantTaskSkillSelection(
        xpertId: string,
        requestedAgentKey: string | undefined,
        references: AgentMiddlewareAssistantTaskInput['selectedSkillRefs']
    ): Promise<{ workspaceId: string; skillIds: string[] } | undefined> {
        const normalizedReferences = Array.from(
            new Map(
                (references ?? [])
                    .map((reference) => ({
                        pluginName: reference.pluginName?.trim(),
                        componentKey: reference.componentKey?.trim()
                    }))
                    .filter((reference) => reference.pluginName && reference.componentKey)
                    .map((reference) => [`${reference.pluginName}\u0000${reference.componentKey}`, reference] as const)
            ).values()
        )
        if (!normalizedReferences.length) {
            return undefined
        }
        if (normalizedReferences.length > 12) {
            throw new Error('Assistant Task selectedSkillRefs cannot contain more than 12 skills')
        }
        const xpert = await this.queryBus.execute<FindXpertQuery, IXpert>(
            new FindXpertQuery({ id: xpertId }, { relations: ['agent'] })
        )
        const runtimeXpert = figureOutXpert(xpert, false)
        const agentKey = requestedAgentKey || runtimeXpert.agent?.key
        const workspaceId = runtimeXpert.workspaceId?.trim()
        if (!agentKey || !workspaceId || !runtimeXpert.graph) {
            throw new Error('Assistant Task target Agent or workspace is unavailable')
        }

        const skillsMiddlewareNodes = getAgentMiddlewareNodes(runtimeXpert.graph, agentKey).filter((node) => {
            const middleware = node.entity as IWFNMiddleware
            return normalizeMiddlewareProvider(middleware?.provider) === SKILLS_MIDDLEWARE_NAME
        })
        if (skillsMiddlewareNodes.length !== 1) {
            throw new Error(
                `Assistant Task target Agent "${agentKey}" must be directly connected to exactly one Skills Middleware`
            )
        }
        const configuredSkillIds = new Set<string>(
            (skillsMiddlewareNodes[0].entity as IWFNMiddleware)?.options?.skills?.filter(
                (skillId: unknown): skillId is string => typeof skillId === 'string' && Boolean(skillId.trim())
            ) ?? []
        )
        if (!configuredSkillIds.size) {
            throw new Error(`Assistant Task target Agent "${agentKey}" has no directly connected skills`)
        }

        // Cross the SkillPackage module through CQRS so the global runtime does
        // not import that module (which would create a Nest bootstrap cycle).
        const packages = await this.queryBus.execute(
            new ResolveRuntimeSkillPackagesQuery(workspaceId, [...configuredSkillIds], RequestContext.currentUser())
        )
        // sharedSkillId is the stable bridge between plugin manifests and the
        // workspace-local package UUIDs consumed by Agent runtime state.
        const packageBySharedId = new Map(
            (packages ?? [])
                .filter((skillPackage) => configuredSkillIds.has(skillPackage.id) && skillPackage.sharedSkillId)
                .map((skillPackage) => [skillPackage.sharedSkillId as string, skillPackage])
        )
        const resolvedSkillIds = normalizedReferences.map((reference) => {
            const sharedSkillId = `plugin:${reference.pluginName}:skill:${reference.componentKey}`
            const skillPackage = packageBySharedId.get(sharedSkillId)
            if (!skillPackage) {
                throw new Error(
                    `Skill "${reference.pluginName}/${reference.componentKey}" is not directly connected to target Agent "${agentKey}"`
                )
            }
            return skillPackage.id
        })

        return { workspaceId, skillIds: resolvedSkillIds }
    }

    private async findAssistantTaskConversation(
        input: AgentMiddlewareAssistantTaskStatusInput
    ): Promise<IChatConversation | null> {
        const conversationId = normalizeOptionalString(input.conversationId)
        const threadId = normalizeOptionalString(input.threadId)
        const taskId = normalizeOptionalString(input.taskId)
        const xpertId = normalizeOptionalString(input.xpertId)
        const conditions = conversationId
            ? { id: conversationId, ...(xpertId ? { xpertId } : {}) }
            : threadId
              ? { threadId, ...(xpertId ? { xpertId } : {}) }
              : taskId
                ? { taskId, ...(xpertId ? { xpertId } : {}) }
                : null

        if (!conditions) {
            return null
        }

        try {
            return await this.queryBus.execute<GetChatConversationQuery, IChatConversation>(
                new GetChatConversationQuery(conditions)
            )
        } catch (error) {
            this.#logger.debug(
                `Assistant task status conversation was not found: ${
                    error instanceof Error ? error.message : String(error)
                }`
            )
            return null
        }
    }

    private async findAssistantTaskExecution(
        input: AgentMiddlewareAssistantTaskStatusInput
    ): Promise<IXpertAgentExecution | null> {
        const executionId = normalizeOptionalString(input.executionId)
        if (!executionId) {
            return null
        }

        try {
            return await this.queryBus.execute<XpertAgentExecutionOneQuery, IXpertAgentExecution>(
                new XpertAgentExecutionOneQuery(executionId)
            )
        } catch (error) {
            this.#logger.debug(
                `Assistant task execution was not found: ${error instanceof Error ? error.message : String(error)}`
            )
            return null
        }
    }
}

function readRecordString(value: object, key: string) {
    const candidate = Reflect.get(value, key)
    return typeof candidate === 'string' ? candidate.trim() : ''
}

function readJsonRecord(value: object, key: string): Record<string, any> | undefined {
    const candidate = Reflect.get(value, key)
    return candidate && typeof candidate === 'object' && !Array.isArray(candidate)
        ? (candidate as Record<string, any>)
        : undefined
}

function readJsonRecordOrString(value: object, key: string): Record<string, any> | undefined {
    const candidate = Reflect.get(value, key)
    const record = readJsonRecord(value, key)
    if (record) return record
    if (typeof candidate !== 'string' || !candidate.trim()) return undefined
    try {
        const parsed = JSON.parse(candidate)
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, any>)
            : undefined
    } catch {
        return undefined
    }
}

function dateString(value: unknown) {
    if (value instanceof Date) return value.toISOString()
    if (typeof value !== 'string' || !value.trim()) return ''
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}
function mapConversationStatusToTaskStatus(
    status: TChatConversationStatus | undefined
): AgentMiddlewareAssistantTaskStatus {
    switch (status) {
        case 'busy':
            return 'running'
        case 'error':
            return 'failed'
        case 'interrupted':
            return 'interrupted'
        case 'idle':
            return 'succeeded'
        default:
            return 'unknown'
    }
}

function mapExecutionStatusToTaskStatus(
    status: XpertAgentExecutionStatusEnum | undefined
): AgentMiddlewareAssistantTaskStatus {
    switch (status) {
        case XpertAgentExecutionStatusEnum.PENDING:
            return 'queued'
        case XpertAgentExecutionStatusEnum.RUNNING:
            return 'running'
        case XpertAgentExecutionStatusEnum.SUCCESS:
            return 'succeeded'
        case XpertAgentExecutionStatusEnum.INTERRUPTED:
            return 'interrupted'
        case XpertAgentExecutionStatusEnum.ERROR:
        case XpertAgentExecutionStatusEnum.TIMEOUT:
            return 'failed'
        default:
            return 'unknown'
    }
}

function normalizeTaskFiles(files: AgentMiddlewareAssistantTaskFile[] | undefined) {
    if (!Array.isArray(files)) {
        return []
    }

    return files
        .map((file) => {
            const fileAssetId = normalizeOptionalString(file.fileAssetId) ?? normalizeOptionalString(file.fileId)
            const storageFileId = normalizeOptionalString(file.storageFileId)
            const originalName = normalizeOptionalString(file.originalName) ?? normalizeOptionalString(file.name)
            const mimeType = normalizeOptionalString(file.mimeType) ?? normalizeOptionalString(file.mimetype)
            if (fileAssetId) {
                return {
                    id: fileAssetId,
                    fileId: fileAssetId,
                    fileAssetId,
                    ...(storageFileId ? { storageFileId } : {}),
                    ...(originalName ? { originalName } : {}),
                    ...(mimeType ? { mimeType } : {}),
                    ...(typeof file.size === 'number' ? { size: file.size } : {})
                }
            }
            if (storageFileId) {
                return {
                    id: storageFileId,
                    ...(originalName ? { originalName } : {}),
                    ...(mimeType ? { mimetype: mimeType, mimeType } : {}),
                    ...(typeof file.size === 'number' ? { size: file.size } : {})
                }
            }
            return null
        })
        .filter(Boolean)
}
