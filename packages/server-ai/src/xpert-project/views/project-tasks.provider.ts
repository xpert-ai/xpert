import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { t } from 'i18next'
import { AGENT_WORKBENCH_SLOT, WORKBENCH_ASSISTANT_EXECUTION_TARGET } from '@xpert-ai/contracts'
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
import { projectTaskDecisionInputSchema } from '@xpert-ai/contracts'

const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
const requireHere = createRequire(__filename)
const change = z
    .object({
        taskId: z.string().uuid(),
        expectedRevision: z.number().int().positive(),
        parentTaskId: z.string().uuid().nullable().optional(),
        predecessorIds: z.array(z.string().uuid()).optional(),
        plannedStartAt: z.string().datetime().nullable().optional(),
        plannedEndAt: z.string().datetime().nullable().optional(),
        estimatedDurationMs: z.number().finite().nonnegative().nullable().optional()
    })
    .strict()

/** Built-in project management View provider; other task Views share the same runtime API. */
@ViewExtensionProvider('platform.project-tasks')
export class ProjectTasksViewProvider implements IXpertViewExtensionProvider {
    constructor(
        private readonly tasks: ProjectTaskGraphService,
        private readonly runtime: ProjectTaskRuntimeReadService,
        private readonly decisions: ProjectTaskDecisionService
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
                title: text('Tasks & timeline', '任务与时间线'),
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
                dataSource: { mode: 'platform', cache: { enabled: false } },
                clientCommands: [{ key: 'workbench.navigation.open', label: text('Open execution', '打开执行') }],
                actions: [
                    ...['task-detail', 'decide-task', 'cancel-attempt', 'request-check'].map((key) => ({
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
            const input = z.object({ taskExecutionId: z.string().uuid() }).strict().parse(request.input)
            const target = await this.tasks.resolveExecution(this.context(context), input.taskExecutionId!)
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
        const input = change.parse(request.input)
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
