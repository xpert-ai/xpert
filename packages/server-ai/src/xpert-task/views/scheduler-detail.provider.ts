import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { t } from 'i18next'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import {
    AGENT_WORKBENCH_SLOT,
    generateCronExpression,
    TaskFrequency,
    type XpertResolvedViewHostContext,
    type XpertExtensionViewManifest,
    type XpertViewActionRequest,
    type XpertViewQuery
} from '@xpert-ai/contracts'
import {
    ViewExtensionProvider,
    renderRemoteReactIframeHtml,
    type IXpertViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import { XpertTaskService } from '../xpert-task.service'
import { ChatConversation } from '../../chat-conversation/conversation.entity'

const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
const requireHere = createRequire(__filename)
const identity = z.object({ taskId: z.string().uuid() }).strict()
const edit = identity.extend({
    name: z.string().trim().min(1).max(100),
    prompt: z.string().trim().min(1),
    timeZone: z.string().trim().min(1),
    options: z
        .object({
            frequency: z.nativeEnum(TaskFrequency),
            time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
            dayOfWeek: z.number().int().min(0).max(6).optional(),
            dayOfMonth: z.number().int().min(1).max(31).optional(),
            month: z.number().int().min(1).max(12).optional(),
            date: z.string().date().optional()
        })
        .strict()
})

@ViewExtensionProvider('platform.scheduler')
export class SchedulerDetailViewProvider implements IXpertViewExtensionProvider {
    constructor(
        private readonly tasks: XpertTaskService,
        @InjectRepository(ChatConversation) private readonly conversations: Repository<ChatConversation>
    ) {}

    supports(context: XpertResolvedViewHostContext) {
        return context.hostType === 'agent'
    }

    getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
        if (!this.supports(context) || slot !== AGENT_WORKBENCH_SLOT) return []
        return [
            {
                key: 'detail',
                title: text('Scheduled task', '定时任务'),
                hostType: 'agent',
                slot,
                activation: { requiredFeatures: ['scheduler'] },
                workbench: { openMode: 'on-demand', menu: { enabled: false } },
                source: { provider: 'platform.scheduler' },
                refreshable: true,
                icon: { type: 'emoji', value: '◷' },
                view: {
                    type: 'remote_component',
                    runtime: 'react',
                    protocolVersion: 1,
                    component: { isolation: 'iframe', entry: 'scheduler-detail' },
                    dataSource: { mode: 'platform' }
                },
                dataSource: {
                    mode: 'platform',
                    cache: { enabled: false },
                    querySchema: { supportsSelection: true, supportsPagination: true, defaultPageSize: 10 }
                },
                clientCommands: [{ key: 'workbench.navigation.open', label: text('Open execution', '打开执行记录') }],
                actions: ['save', 'pause', 'resume', 'execution-target'].map((key) => ({
                    key,
                    label: text(
                        key,
                        { save: '保存', pause: '暂停', resume: '恢复', 'execution-target': '打开执行记录' }[key]
                    ),
                    actionType: 'invoke' as const,
                    placement: 'toolbar' as const
                }))
            }
        ]
    }

    private async task(context: XpertResolvedViewHostContext, id: string) {
        const task = await this.tasks.findHttpAccessibleById(z.string().uuid().parse(id))
        if (
            context.hostType !== 'agent' ||
            task.xpertId !== context.hostId ||
            (task.projectId && task.projectId !== context.runtimeScope?.projectId)
        )
            throw new NotFoundException(t('server-ai:Error.XpertTaskNotFound'))
        return task
    }

    async getViewData(context: XpertResolvedViewHostContext, _viewKey: string, query: XpertViewQuery) {
        if (!query.selectionId) return { item: null }
        const task = await this.task(context, query.selectionId)
        const page = Math.max(1, Math.trunc(query.page || 1)),
            pageSize = Math.min(50, Math.max(1, Math.trunc(query.pageSize || 10)))
        const [runs, total] = await this.conversations.findAndCount({
            where: { taskId: task.id, tenantId: context.tenantId, organizationId: context.organizationId ?? IsNull() },
            select: ['id', 'title', 'status', 'createdAt'],
            order: { createdAt: 'DESC' },
            take: pageSize,
            skip: (page - 1) * pageSize
        })
        return {
            item: {
                id: task.id,
                name: task.name,
                prompt: task.prompt,
                options: task.options,
                timeZone: task.timeZone || 'UTC',
                status: task.status,
                statusReason: task.statusReason,
                scheduleDescription: task.scheduleDescription,
                runs: runs.map((run) => ({
                    id: run.id,
                    title: run.title,
                    status: run.status,
                    createdAt: run.createdAt?.toISOString()
                })),
                total,
                page,
                pageSize
            }
        }
    }

    async executeViewAction(
        context: XpertResolvedViewHostContext,
        _viewKey: string,
        actionKey: string,
        request: XpertViewActionRequest
    ) {
        const { taskId } = identity.strip().parse(request.input)
        const task = await this.task(context, taskId)
        if (actionKey === 'save') {
            const input = edit.parse(request.input)
            const options = { ...input.options, frequency: input.options.frequency, time: input.options.time }
            try {
                generateCronExpression(options)
            } catch {
                throw new BadRequestException(t('server-ai:ResourceCard.InvalidSchedule'))
            }
            try {
                new Intl.DateTimeFormat('en', { timeZone: input.timeZone })
            } catch {
                throw new BadRequestException(t('server-ai:ResourceCard.InvalidTimeZone'))
            }
            await this.tasks.updateHttpTask(task.id, {
                name: input.name,
                prompt: input.prompt,
                options,
                timeZone: input.timeZone
            })
        } else if (actionKey === 'pause') await this.tasks.pauseHttpTask(task.id)
        else if (actionKey === 'resume') await this.tasks.scheduleHttpTask(task.id)
        else if (actionKey === 'execution-target') {
            const input = identity.extend({ conversationId: z.string().uuid() }).parse(request.input)
            const run = await this.conversations.findOneByOrFail({
                id: input.conversationId,
                taskId: task.id,
                tenantId: context.tenantId,
                organizationId: context.organizationId ?? IsNull()
            })
            return {
                success: true,
                data: {
                    target: 'assistant.conversation',
                    conversationId: run.id,
                    threadId: run.threadId,
                    xpertId: task.xpertId,
                    ...(task.projectId ? { projectId: task.projectId } : {})
                }
            }
        } else throw new BadRequestException(t('server-ai:Error.ProjectTaskActionUnsupported'))
        return { success: true, refresh: true }
    }

    async getRemoteComponentEntry() {
        const moduleRoot = join(__dirname, '..', 'remote-components', 'scheduler-detail')
        const root = existsSync(join(moduleRoot, 'app.js'))
            ? moduleRoot
            : join(__dirname, 'remote-components', 'scheduler-detail')
        const packageFile = (name: string, file: string) =>
            readFile(join(dirname(requireHere.resolve(`${name}/package.json`)), file), 'utf8')
        const [appScript, appCss, reactUmd, reactDomUmd] = await Promise.all([
            readFile(join(root, 'app.js'), 'utf8'),
            readFile(join(root, 'app.css'), 'utf8'),
            packageFile('react', 'umd/react.production.min.js'),
            packageFile('react-dom', 'umd/react-dom.production.min.js')
        ])
        return {
            html: renderRemoteReactIframeHtml({ title: 'Scheduled task', appScript, appCss, reactUmd, reactDomUmd }),
            contentType: 'text/html; charset=utf-8' as const
        }
    }
}
