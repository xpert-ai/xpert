// Reserve the invocation before creating task state. Checkpoint replay reuses the pinned
// dependency/model snapshot and the child graph's own namespace, never the parent's messages.
import { Injectable, BadRequestException } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import type { RunnableConfig } from '@langchain/core/runnables'
import { isAIMessage } from '@langchain/core/messages'
import { interrupt, isGraphInterrupt } from '@langchain/langgraph'
import {
    AiModelTypeEnum,
    LongTermMemoryTypeEnum,
    templateDependencyLocksSchema,
    stringifyMessageContent,
    getXpertAgentRecursionLimit,
    type IXpertAgentExecution,
    type TemplateAgentSource,
    type TCopilotModel,
    type TSandboxConfigurable
} from '@xpert-ai/contracts'
import { DefaultRuntimeCapabilityRegistry, RequestContext, type AgentJson } from '@xpert-ai/plugin-sdk'
import { createHash } from 'node:crypto'
import { z } from 'zod/v3'
import { t } from 'i18next'
import { AgentInvocationRuntime, invocationError } from '../../agent-invocation/invocation-runtime'
import type { AgentInvocationBuildContext } from '../../agent-invocation/agent-invocation-graph.service'
import { NativeAgentExecution } from '../../agent-invocation/native-agent.strategy'
import type { RuntimeTemplateDescriptor } from '../../agent-plugin/templates/runtime-template'
import {
    AuthorizeTemplateExecutionCommand,
    ResolveTemplateExecutionCommand
} from '../../agent-plugin/templates/resolve-template-execution.command'
import { templateInputParameters } from '../../agent-plugin/templates/runtime-template'
import { getErrorMessage } from '@xpert-ai/server-common'
import { closeGraphRuntimeCleanups } from '../commands/handlers/toolset-runtime-cleanup'
import { createTemplateExecutionDefinition } from '../../shared/agent/execution-definition'
import { AgentStateAnnotation } from '../../shared/agent/state'
import { CompileGraphCommand } from '../commands/compile-graph.command'
import { wrapAgentExecution } from '../../shared/agent/execution'
import { withExecutionContext } from '../../shared/agent/execution-context'
import { ExecutionCancelService } from '../../execution-control/execution-cancel.service'
import { executionAbortScope } from '../../execution-control/execution-abort-scope'
import { ExecutionCancelledError } from '../../execution-control/execution-cancelled.error'
import { XpertWorkAreaResolver } from '../../shared/volume/work-area'
import { SandboxAcquireBackendCommand } from '../../sandbox/commands/acquire-backend.command'
import { resolveSandboxWorkFor } from '../../sandbox/sandbox-work-for'
import { createTemplateTaskContext } from './template-task-context'
import { templateSubagentToolName } from './template-subagents.middleware'

const modelSchema = z
    .object({
        copilotId: z.string().optional(),
        model: z.string().optional(),
        modelType: z.nativeEnum(AiModelTypeEnum).optional(),
        options: z.record(z.unknown()).optional()
    })
    .strict()
const snapshotSchema = z
    .object({ locks: templateDependencyLocksSchema, model: modelSchema.optional(), graphDigest: z.string() })
    .strict()
const json: z.ZodType<AgentJson> = z.lazy(() =>
    z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(json), z.record(json)])
)

function modelSnapshot(model?: TCopilotModel) {
    if (!model || !(model.copilotId || model.copilot?.id || model.model)) return undefined
    return modelSchema.parse({
        copilotId: model.copilotId ?? model.copilot?.id,
        model: model.model,
        modelType: model.modelType,
        options: model.options
    })
}

@Injectable()
export class TemplateSubagentRuntimeService {
    constructor(
        private readonly commands: CommandBus,
        private readonly queries: QueryBus,
        private readonly runtime: AgentInvocationRuntime,
        private readonly cancellations: ExecutionCancelService,
        private readonly workAreas: XpertWorkAreaResolver
    ) {}

    async invoke(
        template: RuntimeTemplateDescriptor,
        input: { input: string; [key: string]: unknown },
        config: RunnableConfig,
        context: AgentInvocationBuildContext,
        fallbackModel?: TCopilotModel
    ): Promise<string> {
        const { options } = context
        const parentExecutionId = config.configurable?.executionId
        const callId = config.configurable?.tool_call_id
        const state: typeof AgentStateAnnotation.State = config.configurable?.runtimeState
        if (typeof parentExecutionId !== 'string' || typeof callId !== 'string' || !state || !context.selection)
            throw invocationError('InvalidScope')
        const source: TemplateAgentSource = {
            kind: 'agent_plugin_template',
            bindingId: template.bindingId,
            version: template.version,
            digest: template.digest,
            packageName: template.packageName,
            templateKey: template.templateKey
        }
        const selection = structuredClone(context.selection)
        const resolve = (locks?: z.output<typeof templateDependencyLocksSchema>) =>
            this.commands.execute(
                new ResolveTemplateExecutionCommand(context.xpertId, selection, source, context.projectId, locks)
            )
        const authorize = async () => {
            await this.commands.execute(
                new AuthorizeTemplateExecutionCommand(context.xpertId, selection, source, context.projectId)
            )
        }
        const capabilities = new DefaultRuntimeCapabilityRegistry().register(NativeAgentExecution, {
            execute: async (invocationId, request, runtimeContext) => {
                try {
                    const previous = request.previous?.metadata?.templateSnapshot
                    const snapshot = request.previous
                        ? snapshotSchema.parse(JSON.parse(z.string().parse(previous)))
                        : undefined
                    const { owner, prepared } = await resolve(snapshot?.locks)
                    const draft = structuredClone(prepared.draft)
                    const model =
                        snapshot?.model ?? modelSnapshot(draft.team.copilotModel) ?? modelSnapshot(fallbackModel)
                    // Keep authored Agent model choices, but never copy a parent's hydrated credential objects.
                    draft.team.copilotModel = model
                    for (const node of draft.nodes)
                        if (node.type === 'agent') node.entity.copilotModel = modelSnapshot(node.entity.copilotModel)
                    const graphDigest = createHash('sha256').update(JSON.stringify(draft)).digest('hex')
                    if (snapshot && snapshot.graphDigest !== graphDigest)
                        throw new BadRequestException(t('server-ai:Error.TemplateDependencyChanged'))
                    await runtimeContext.checkpoint({
                        status: 'running',
                        handle: {
                            sessionId: invocationId,
                            runId: invocationId,
                            metadata: {
                                templateSnapshot: JSON.stringify({ locks: prepared.locks, model, graphDigest })
                            }
                        }
                    })
                    const reauthorize = async () => {
                        await resolve(prepared.locks)
                    }
                    const manifest = draft.template?.manifest
                    draft.team = {
                        ...draft.team,
                        id: owner.id,
                        tenantId: owner.tenantId,
                        organizationId: owner.organizationId,
                        workspaceId: owner.workspaceId,
                        workspaceDataScope: owner.workspaceDataScope,
                        options: { ...draft.team.options, templateDefinition: draft.template }
                    }
                    const area = await this.workAreas.resolve({
                        tenantId: owner.tenantId,
                        userId: RequestContext.currentUserId(),
                        xpertId: owner.id,
                        projectId: context.projectId,
                        conversationId: options.conversationId,
                        workspaceDataScope: owner.workspaceDataScope,
                        provider: draft.team.features?.sandbox?.provider
                    })
                    const task = await createTemplateTaskContext(
                        area,
                        invocationId,
                        owner,
                        manifest,
                        this.commands,
                        reauthorize
                    )
                    const setup = await task.taskSetup()
                    const missingConnector = setup.connectors.find(
                        (connector) => connector.required && connector.status !== 'ready'
                    )
                    if (missingConnector)
                        throw new BadRequestException(
                            t('server-ai:Error.TemplateSubagentDependencyUnavailable', {
                                dependency: missingConnector.key,
                                status: missingConnector.status
                            })
                        )
                    await this.cancellations.attach(invocationId, parentExecutionId, 'attached')
                    const abort = executionAbortScope(invocationId, this.cancellations, [options.signal, config.signal])
                    await this.cancellations.check(invocationId)
                    const execution: IXpertAgentExecution = {
                        id: invocationId,
                        xpert: owner,
                        parentId: parentExecutionId,
                        agentKey: draft.team.agent.key,
                        title: template.title,
                        inputs: input,
                        threadId: options.thread_id,
                        checkpointNs: `template_${invocationId}`,
                        metadata: {
                            invocationKind: 'sub_agent',
                            sourceToolCallId: callId,
                            templateSource: source,
                            assistantName: template.title
                        }
                    }
                    try {
                        let sandbox: TSandboxConfigurable | null = null
                        if (draft.team.features?.sandbox?.enabled)
                            sandbox = await this.commands.execute(
                                new SandboxAcquireBackendCommand({
                                    provider: draft.team.features.sandbox.provider,
                                    tenantId: owner.tenantId,
                                    organizationId: owner.organizationId,
                                    conversationId: options.conversationId,
                                    workFor: resolveSandboxWorkFor({
                                        projectId: context.projectId,
                                        userId: RequestContext.currentUserId()
                                    }),
                                    volumeScope: area.volumeScope,
                                    workingDirectory: task.workingDirectory,
                                    workspaceBinding: { ...area.workspaceBinding, workspacePath: task.workingDirectory }
                                })
                            )
                        const result = await withExecutionContext(
                            { sandbox },
                            wrapAgentExecution(
                                async () => {
                                    abort.controller.signal.throwIfAborted()
                                    const { graph } = await this.commands.execute(
                                        new CompileGraphCommand(draft.team.agent.key, draft.team, {
                                            // Carry execution infrastructure only; do not inherit tools, environment or dynamic selection.
                                            store: options.store,
                                            subscriber: options.subscriber,
                                            shouldPause: options.shouldPause,
                                            planMode: options.planMode,
                                            conversationId: options.conversationId,
                                            projectId: context.projectId,
                                            language: options.language,
                                            timeZone: options.timeZone,
                                            executionDefinition: createTemplateExecutionDefinition({
                                                source,
                                                ownerId: owner.id,
                                                memoryNamespace: invocationId,
                                                draft,
                                                skills: prepared.skills,
                                                setup,
                                                taskSetup: task.taskSetup,
                                                authorize: reauthorize
                                            }),
                                            mute: [],
                                            unmutes: [],
                                            execution,
                                            isDraft: false,
                                            leaderKey: context.agentKey,
                                            rootExecutionId: invocationId,
                                            thread_id: options.thread_id,
                                            rootController: abort.controller,
                                            signal: abort.controller.signal,
                                            workspaceRoot: area.workspaceRoot,
                                            workspacePath: task.workingDirectory
                                        })
                                    )
                                    const childConfig = {
                                        ...config,
                                        context: { sandbox },
                                        signal: abort.controller.signal,
                                        recursionLimit: getXpertAgentRecursionLimit(draft.team.agentConfig),
                                        metadata: {
                                            ...config.metadata,
                                            executionId: invocationId,
                                            parentExecutionId,
                                            agentKey: draft.team.agent.key,
                                            xpertName: template.title
                                        },
                                        configurable: {
                                            ...config.configurable,
                                            executionId: invocationId,
                                            rootExecutionId: invocationId,
                                            xpertId: owner.id,
                                            agentKey: draft.team.agent.key,
                                            rootAgentKey: draft.team.agent.key,
                                            sandbox,
                                            copilotModel: model,
                                            context: {},
                                            toolName: undefined,
                                            tool_call_id: undefined,
                                            checkpoint_ns: `template_${invocationId}`,
                                            checkpoint_id: undefined,
                                            __pregel_checkpointer:
                                                config.configurable?.__pregel_checkpointer ?? graph.checkpointer,
                                            checkpoint_map: undefined,
                                            runtimeState: undefined
                                        }
                                    }
                                    const checkpoint = await graph.getState(childConfig)
                                    const childState = templateTaskState(
                                        state,
                                        input,
                                        task.workingDirectory,
                                        area.workspaceRoot,
                                        prepared.draft
                                    )
                                    const output = checkpoint?.config?.configurable?.checkpoint_id
                                        ? checkpoint.next.length
                                            ? await graph.invoke(null, childConfig)
                                            : checkpoint.values
                                        : await graph.invoke(childState, childConfig)
                                    const last = [...(output.messages ?? [])].reverse().find(isAIMessage)
                                    const text = last ? stringifyMessageContent(last.content) : ''
                                    return { output: text, state: text }
                                },
                                {
                                    commandBus: this.commands,
                                    queryBus: this.queries,
                                    execution,
                                    subscriber: options.subscriber
                                }
                            )
                        )
                        return { status: 'succeeded' as const, result: { text: result } }
                    } catch (error) {
                        if (abort.controller.signal.aborted || error instanceof ExecutionCancelledError)
                            return { status: 'cancelled' as const }
                        throw error
                    } finally {
                        await closeGraphRuntimeCleanups(abort.controller)
                        abort.dispose()
                    }
                } catch (error) {
                    if (isGraphInterrupt(error)) throw error
                    if (config.signal?.aborted || options.signal?.aborted || error instanceof ExecutionCancelledError)
                        return { status: 'cancelled' as const }
                    return { status: 'failed' as const, error: getErrorMessage(error) }
                }
            }
        })
        const api = this.runtime.scoped({
            scope: {
                tenantId: context.caller.tenantId,
                organizationId: context.caller.organizationId,
                userId: RequestContext.currentUserId(),
                workspaceId: context.caller.workspaceId,
                projectId: context.projectId,
                conversationId: options.conversationId,
                parentExecutionId,
                callerAgentKey: context.agentKey,
                callerXpertId: context.xpertId
            },
            capabilities,
            signal: config.signal ?? options.signal,
            authorize,
            isSuspension: isGraphInterrupt
        })
        const result = await api.start({
            target: {
                provider: 'xpert',
                bindingId: templateSubagentToolName(template),
                reference: context.xpertId,
                revision: template.digest,
                configuration: { source: json.parse(source) }
            },
            callId: `${templateSubagentToolName(template)}:${callId}`,
            input: { prompt: input.input, parameters: z.record(json).parse(input) }
        })
        if (result.status === 'succeeded') return result.result.text
        if (result.status === 'cancelled') throw new ExecutionCancelledError(result.id, result.error)
        if (result.status === 'failed' || result.status === 'unknown')
            throw new Error(result.error || t('server-ai:Error.TemplateSubagentFailed'))
        interrupt({ type: 'agent_invocation', invocationId: result.id, status: result.status })
        throw invocationError('ConcurrentUpdate')
    }
}

export function templateTaskState(
    parent: typeof AgentStateAnnotation.State,
    input: { input: string; [key: string]: unknown },
    workingDirectory: string,
    workspaceRoot: string,
    draft: import('@xpert-ai/contracts').AssistantTemplateDefinition
) {
    const { language, timezone, user_email, date, datetime, common_times } = parent.sys
    const names = new Set(['input', ...templateInputParameters(draft).map(({ name }) => name)])
    const parameters = Object.fromEntries(Object.entries(input).filter(([name]) => names.has(name)))
    return {
        ...parameters,
        messages: [],
        human: parameters,
        sys: {
            language,
            timezone,
            user_email,
            date,
            datetime,
            common_times,
            workspace_path: workingDirectory,
            workspace_root: workspaceRoot,
            memory_workspace_path: `${workingDirectory}/.memory`
        },
        memories: (draft.memories ?? []).map((memory) => ({
            namespace: ['template', LongTermMemoryTypeEnum.PROFILE],
            key: memory.prefix,
            value: { profile: JSON.stringify({ name: memory.prefix, value: memory.value }) },
            createdAt: new Date(0),
            updatedAt: new Date(0)
        }))
    }
}
