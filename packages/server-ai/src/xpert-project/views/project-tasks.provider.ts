import { projectTaskPlanSchema } from '../project-task-plan.schema'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { t } from 'i18next'
import { AGENT_WORKBENCH_SLOT, WORKBENCH_ASSISTANT_EXECUTION_TARGET, codingExecutionViewKey } from '@xpert-ai/contracts'
import type {
    XpertResolvedViewHostContext,
    XpertExtensionViewManifest,
    XpertViewActionRequest
} from '@xpert-ai/contracts'
import {
    ViewExtensionProvider,
    renderRemoteReactIframeHtml,
    type IXpertViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import { ProjectTaskGraphService } from '../services/project-task-graph.service'
import { ProjectTaskRuntimeReadService } from '../runtime/project-task-runtime-read.service'
import { ProjectTaskDecisionService } from '../runtime/project-task-decision.service'
import {
    projectTaskDecisionInputSchema,
    projectPipelineDecisionSchema,
    projectPipelineNextRoundSchema,
    projectPipelineEvidenceRefSchema,
    projectPipelineCancelSchema,
    projectPipelineRetrySchema,
    projectPipelineCatalogConfigureSchema,
    projectPipelineProviderActionCommandSchema,
    projectPipelineAnalyticsInputSchema,
    projectPipelineCatalogRequestSchema
} from '@xpert-ai/contracts'
import { ProjectPipelineProviderActionsService } from '../pipeline/provider-actions/provider-actions.service'
import { ProjectPipelineCatalogService } from '../pipeline/configuration/pipeline-catalog.service'
import { pipelineBindingsPageInput } from '../pipeline/configuration/pipeline-bindings.service'
import { ProjectPipelineQueryService } from '../pipeline/queries/pipeline-query.service'
import { ProjectPipelineAnalyticsService } from '../pipeline/queries/pipeline-analytics.service'
import { ProjectPipelineCommandsService } from '../pipeline/runtime/pipeline-commands.service'
import { ProjectPipelineEvidenceAccessService } from '../pipeline/runtime/pipeline-evidence-access.service'

const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
const requireHere = createRequire(__filename)
/** Built-in project management View provider; other task Views share the same runtime API. */
@ViewExtensionProvider('platform.project-tasks')
export class ProjectTasksViewProvider implements IXpertViewExtensionProvider {
    constructor(
        private readonly tasks: ProjectTaskGraphService,
        private readonly runtime: ProjectTaskRuntimeReadService,
        private readonly decisions: ProjectTaskDecisionService,
        private readonly pipelines: ProjectPipelineQueryService,
        private readonly pipelineCommands: ProjectPipelineCommandsService,
        private readonly pipelineEvidence: ProjectPipelineEvidenceAccessService,
        private readonly pipelineCatalog: ProjectPipelineCatalogService,
        private readonly providerActions: ProjectPipelineProviderActionsService,
        private readonly pipelineAnalytics: ProjectPipelineAnalyticsService
    ) {}
    supports(context: XpertResolvedViewHostContext) {
        return context.hostType === 'project' || context.hostType === 'agent'
    }
    getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
        const agent = context.hostType === 'agent'
        if (slot !== (agent ? AGENT_WORKBENCH_SLOT : 'task.management')) return []
        if (agent && !context.runtimeScope?.projectId) return []
        return [
            {
                key: 'timeline',
                title: text('Project tasks', '项目任务'),
                hostType: context.hostType,
                // Workbench can run in an isolated ChatKit iframe without the host icon font.
                icon: {
                    type: 'svg',
                    value: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7v10M18 7a11 11 0 0 1-11 11"/><circle cx="6" cy="4" r="3"/><circle cx="6" cy="20" r="3"/><circle cx="18" cy="4" r="3"/></svg>'
                },
                ...(agent
                    ? {
                          activation: { requiredFeatures: ['project.tasks'] },
                          workbench: { openMode: 'on-demand' as const, menu: { enabled: true, order: 50 } }
                      }
                    : {}),
                slot,
                order: 0,
                refreshable: true,
                source: { provider: 'platform.project-tasks' },
                view: {
                    type: 'remote_component',
                    runtime: 'react',
                    protocolVersion: 1,
                    component: { isolation: 'iframe', entry: 'project-tasks' },
                    dataSource: { mode: 'platform' }
                },
                dataSource: { mode: 'platform', querySchema: { supportsParameters: true }, cache: { enabled: false } },
                clientCommands: [
                    { key: 'workbench.navigation.open', label: text('Open execution', '打开执行') },
                    ...(agent
                        ? [{ key: 'assistant.context.set', label: text('Set pipeline context', '设置流水线上下文') }]
                        : [])
                ],
                actions: [
                    {
                        key: 'pipeline-configure',
                        label: text('Save pipeline configuration', '保存流水线配置'),
                        actionType: 'invoke',
                        requiredHostAccess: 'manage'
                    },
                    {
                        key: 'pipeline-configurations',
                        label: text('Saved pipeline configurations', '已保存配置'),
                        actionType: 'invoke',
                        requiredHostAccess: 'manage'
                    },
                    ...[
                        'task-detail',
                        'decide-task',
                        'cancel-attempt',
                        'request-check',
                        'pipeline-list',
                        'pipeline-rounds',
                        'pipeline-graph',
                        'pipeline-refresh',
                        'pipeline-analytics',
                        'pipeline-decision',
                        'pipeline-next-round',
                        'pipeline-evidence',
                        'pipeline-cancel',
                        'pipeline-retry',
                        'pipeline-catalog',
                        'pipeline-provider-actions',
                        'pipeline-provider-node-details',
                        'pipeline-provider-action'
                    ].map((key) => ({
                        key,
                        label: text('Task result', '任务结果'),
                        actionType: 'invoke' as const,
                        placement: 'toolbar' as const
                    })),
                    {
                        key: 'execution-target',
                        label: text('Open execution', '打开执行'),
                        actionType: 'invoke',
                        placement: 'toolbar'
                    },
                    {
                        key: 'change',
                        label: text('Update task plan', '更新任务计划'),
                        actionType: 'invoke',
                        placement: 'toolbar'
                    }
                ]
            }
        ]
    }
    private context(context: XpertResolvedViewHostContext) {
        const projectId = context.hostType === 'project' ? context.hostId : context.runtimeScope?.projectId
        if (!projectId || !context.userId) throw Error(t('server-ai:Error.ProjectTaskContextRequired'))
        return {
            projectId,
            actor: { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId }
        }
    }
    async getViewData(context: XpertResolvedViewHostContext) {
        return { item: await this.tasks.graph(this.context(context)) }
    }
    async executeViewAction(
        context: XpertResolvedViewHostContext,
        _viewKey: string,
        actionKey: string,
        request: XpertViewActionRequest
    ) {
        if (actionKey === 'pipeline-provider-node-details') {
            const input = z
                .object({ instanceId: z.string().uuid(), nodeInstanceId: z.string().uuid() })
                .strict()
                .parse(request.input)
            return {
                success: true,
                data: await this.providerActions.describe(this.context(context), {
                    instanceId: input.instanceId,
                    nodeInstanceId: input.nodeInstanceId
                })
            }
        }
        if (actionKey === 'pipeline-provider-actions') {
            const input = z
                .object({ instanceId: z.string().uuid(), nodeInstanceId: z.string().uuid() })
                .strict()
                .parse(request.input)
            return {
                success: true,
                data: await this.providerActions.list(this.context(context), {
                    instanceId: input.instanceId,
                    nodeInstanceId: input.nodeInstanceId
                })
            }
        }
        if (actionKey === 'pipeline-provider-action')
            return {
                success: true,
                data: await this.providerActions.submit(
                    this.context(context),
                    projectPipelineProviderActionCommandSchema.parse(request.input)
                )
            }
        if (actionKey === 'pipeline-catalog') {
            return {
                success: true,
                data: await this.pipelineCatalog.list(
                    this.context(context),
                    projectPipelineCatalogRequestSchema.parse(request.input)
                )
            }
        }
        if (actionKey === 'pipeline-configure')
            return {
                success: true,
                data: await this.pipelineCatalog.configure(
                    this.context(context),
                    projectPipelineCatalogConfigureSchema.parse(request.input)
                )
            }
        if (actionKey === 'pipeline-configurations')
            return {
                success: true,
                data: await this.pipelineCatalog.bindings(
                    this.context(context),
                    pipelineBindingsPageInput.parse(request.input)
                )
            }
        if (actionKey === 'pipeline-analytics')
            return {
                success: true,
                data: await this.pipelineAnalytics.read(
                    this.context(context),
                    projectPipelineAnalyticsInputSchema.parse(request.input)
                )
            }
        if (actionKey === 'pipeline-list') {
            const input = z.object({ after: z.string().uuid().optional() }).strict().parse(request.input)
            return { success: true, data: await this.pipelines.list(this.context(context), input) }
        }
        if (actionKey === 'pipeline-rounds') {
            const input = z
                .object({ instanceId: z.string().uuid(), after: z.string().uuid().optional() })
                .strict()
                .parse(request.input)
            return {
                success: true,
                data: await this.pipelines.rounds(this.context(context), input.instanceId, { after: input.after })
            }
        }
        if (actionKey === 'pipeline-graph') {
            const input = z
                .object({ instanceId: z.string().uuid(), roundId: z.string().uuid().optional() })
                .strict()
                .parse(request.input)
            return {
                success: true,
                data: await this.pipelines.graph(this.context(context), input.instanceId, { roundId: input.roundId })
            }
        }
        if (actionKey === 'pipeline-refresh') {
            const input = z.object({ instanceId: z.string().uuid() }).strict().parse(request.input)
            const contextScope = this.context(context)
            const graph = await this.pipelines.graph(contextScope, input.instanceId)
            if (graph.instance.authority === 'platform') return { success: true, data: { status: 'ready' } }
            return {
                success: true,
                data: await this.pipelines.refresh(contextScope, {
                    providerRef: graph.instance.ownerRef,
                    sourceKey: graph.instance.sourceKey
                })
            }
        }
        if (actionKey === 'pipeline-decision')
            return {
                success: true,
                refresh: true,
                data: await this.pipelineCommands.decide(
                    this.context(context),
                    projectPipelineDecisionSchema.parse(request.input)
                )
            }
        if (actionKey === 'pipeline-next-round')
            return {
                success: true,
                refresh: true,
                data: await this.pipelineCommands.nextRound(
                    this.context(context),
                    projectPipelineNextRoundSchema.parse(request.input)
                )
            }
        if (actionKey === 'pipeline-cancel')
            return {
                success: true,
                refresh: true,
                data: await this.pipelineCommands.cancel(
                    this.context(context),
                    projectPipelineCancelSchema.parse(request.input)
                )
            }
        if (actionKey === 'pipeline-retry')
            return {
                success: true,
                refresh: true,
                data: await this.pipelineCommands.retry(
                    this.context(context),
                    projectPipelineRetrySchema.parse(request.input)
                )
            }
        if (actionKey === 'pipeline-evidence')
            return {
                success: true,
                data: await this.pipelineEvidence.read(
                    this.context(context),
                    projectPipelineEvidenceRefSchema.parse(request.input)
                )
            }
        if (actionKey === 'task-detail') {
            const input = z.object({ taskId: z.string().uuid() }).strict().parse(request.input)
            return { success: true, data: await this.runtime.get(this.context(context).projectId, input.taskId) }
        }
        if (actionKey === 'decide-task') {
            return {
                success: true,
                data: await this.decisions.decide(
                    this.context(context).projectId,
                    projectTaskDecisionInputSchema.parse(request.input)
                ),
                refresh: true
            }
        }
        if (actionKey === 'cancel-attempt' || actionKey === 'request-check') {
            const input = z
                .object({ taskId: z.string().uuid(), executionId: z.string().uuid() })
                .strict()
                .parse(request.input)
            return {
                success: true,
                data: await this.runtime.control(
                    this.context(context).projectId,
                    input.taskId,
                    input.executionId,
                    actionKey === 'cancel-attempt' ? 'cancel' : 'request-check'
                ),
                refresh: true
            }
        }
        if (actionKey === 'execution-target') {
            const input = z
                .object({
                    taskExecutionId: z.string().uuid(),
                    destination: z.enum(['execution', 'conversation']).optional()
                })
                .strict()
                .parse(request.input)
            const target = await this.tasks.resolveExecution(this.context(context), input.taskExecutionId!)
            if (target.kind === 'runtime_invocation') {
                if (input.destination === 'conversation')
                    throw Error(t('server-ai:Error.ProjectTaskExecutionUnavailable'))
                return {
                    success: true,
                    data: {
                        target: 'assistant.project',
                        projectId: target.projectId,
                        viewKey: target.codingInvocationId ? codingExecutionViewKey : 'platform.agent-results__results',
                        selectionId: target.invocationId
                    }
                }
            }
            if (input.destination === 'conversation')
                return {
                    success: true,
                    data: {
                        target: 'assistant.conversation',
                        projectId: target.projectId,
                        conversationId: target.conversationId,
                        threadId: target.threadId,
                        xpertId: target.xpertId
                    }
                }
            if (target.invocationId || target.codingInvocationId)
                return {
                    success: true,
                    data: {
                        // The Agent Workbench already has the authorized project scope. A project
                        // navigation would mint a new Desktop chat session and clear its thread.
                        target: context.hostType === 'agent' ? 'workbench.view' : 'assistant.project',
                        viewKey: target.codingInvocationId ? codingExecutionViewKey : 'platform.agent-results__results',
                        selectionId: target.invocationId ?? target.codingInvocationId,
                        projectId: target.projectId,
                        conversationId: target.conversationId,
                        xpertId: target.xpertId
                    }
                }
            return {
                success: true,
                data: {
                    target: WORKBENCH_ASSISTANT_EXECUTION_TARGET,
                    projectId: target.projectId,
                    conversationId: target.conversationId,
                    threadId: target.threadId,
                    executionId: target.agentExecutionId,
                    xpertId: target.xpertId
                }
            }
        }
        if (actionKey !== 'change') throw Error(t('server-ai:Error.ProjectTaskActionUnsupported'))
        const input = projectTaskPlanSchema.parse(request.input)
        const graph = await this.tasks.change(this.context(context), {
            ...input,
            taskId: input.taskId!,
            expectedRevision: input.expectedRevision!
        })
        return { success: true, data: graph, refresh: true }
    }
    async getRemoteComponentEntry() {
        // tsc/source retain the module tree; the bundled API copies assets beside main.js.
        const moduleRoot = join(__dirname, '..', 'remote-components', 'project-tasks')
        const root = existsSync(join(moduleRoot, 'app.js'))
            ? moduleRoot
            : join(__dirname, 'remote-components', 'project-tasks')
        const packageFile = (name: string, file: string) =>
            readFile(join(dirname(requireHere.resolve(`${name}/package.json`)), file), 'utf8')
        const [appScript, appCss, reactUmd, reactDomUmd] = await Promise.all([
            readFile(join(root, 'app.js'), 'utf8'),
            readFile(join(root, 'app.css'), 'utf8'),
            packageFile('react', 'umd/react.production.min.js'),
            packageFile('react-dom', 'umd/react-dom.production.min.js')
        ])
        return {
            html: renderRemoteReactIframeHtml({ title: 'Project tasks', appScript, appCss, reactUmd, reactDomUmd }),
            contentType: 'text/html; charset=utf-8' as const
        }
    }
}
