import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { ScheduleTaskStatus, type IXpertTask, type ConversationScheduleMonitor } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { IsNull, type Repository } from 'typeorm'
import { CronTime } from 'cron'
import { v5 as uuid } from 'uuid'
import { z } from 'zod'
import { AssertChatConversationAccessQuery } from '../chat-conversation/queries/conversation-assert-access.query'
import { XpertTask } from './xpert-task.entity'

export const monitorInterval = z.number().int().min(1).max(525600)
export const monitorDestination = z.discriminatedUnion('type', [
    z
        .object({ type: z.literal('conversation'), conversationId: z.string().uuid(), threadId: z.string().uuid() })
        .strict(),
    z.object({ type: z.literal('new_chat') }).strict()
])
export type MonitorDestination = z.infer<typeof monitorDestination>
export const monitorForm = z
    .object({
        name: z.string().trim().min(1).max(100),
        prompt: z.string().trim().min(1).max(16000),
        timeZone: z.string().min(1).max(100),
        requestId: z.string().uuid(),
        threadId: z.string().trim().min(1).max(100),
        destination: monitorDestination.optional(),
        intervalMinutes: monitorInterval.default(30)
    })
    .strict()

export type MonitorCreation = {
    source: 'menu' | 'agent'
    conversationId: string
    threadId: string
    requestKey: string
    destination?: MonitorDestination
    intervalMinutes?: number
}

export function requireMonitorTarget(
    queries: QueryBus,
    task: Pick<IXpertTask, 'xpertId' | 'projectId'>,
    target: Pick<MonitorCreation, 'conversationId' | 'threadId'>
) {
    if (!task.xpertId || !target.conversationId || !target.threadId)
        throw new ForbiddenException(t('server-ai:Error.ScheduleConversationUnavailable'))
    return queries.execute(
        new AssertChatConversationAccessQuery(
            {
                id: target.conversationId,
                threadId: target.threadId,
                xpertId: task.xpertId,
                tenantId: RequestContext.currentTenantId(),
                organizationId: RequestContext.getOrganizationId() || IsNull(),
                projectId: task.projectId ?? IsNull()
            },
            'contribute'
        )
    )
}

export function monitorCadence(intervalMinutes: number, now = new Date()) {
    monitorInterval.parse(intervalMinutes)
    const anchor = new Date(Math.floor(now.getTime() / 60000) * 60000)
    // Cron wakes on the possible minutes. The UTC anchor also covers intervals that span hours or days.
    let step = 60,
        remainder = intervalMinutes
    while (remainder) [step, remainder] = [remainder, step % remainder]
    const phase = anchor.getUTCMinutes() % step
    const minutes = step === 60 ? String(phase) : step === 1 ? '*' : `${phase}-59/${step}`
    const schedule = minutes + ' * * * *'
    return { schedule, anchorAt: anchor.toISOString() }
}
export function monitorIsDue(monitor: ConversationScheduleMonitor, date: Date) {
    if (!monitor.anchorAt) return true
    const elapsed = Math.floor(date.getTime() / 60000) - Math.floor(Date.parse(monitor.anchorAt) / 60000)
    return elapsed > 0 && elapsed % monitor.intervalMinutes === 0
}
export function nextMonitorCheck(
    monitor: ConversationScheduleMonitor,
    schedule: string,
    timeZone: string,
    now = Date.now()
) {
    if (!monitor.anchorAt) return new CronTime(schedule, timeZone || 'UTC').sendAt().toISO()
    const start = Date.parse(monitor.anchorAt),
        period = monitor.intervalMinutes * 60000
    return new Date(start + Math.max(1, Math.floor((now - start) / period) + 1) * period).toISOString()
}

export function monitorBinding(
    destination: MonitorDestination
): (Pick<MonitorCreation, 'conversationId' | 'threadId'> & { target: 'conversation' }) | { target: 'new_chat' } {
    return destination.type === 'new_chat'
        ? { target: 'new_chat' }
        : { target: 'conversation', conversationId: destination.conversationId, threadId: destination.threadId }
}

export async function resolveMonitorDestination(queries: QueryBus, xpertId: string, destination: MonitorDestination) {
    if (destination.type === 'new_chat') return null
    return queries.execute(
        new AssertChatConversationAccessQuery(
            {
                id: destination.conversationId,
                threadId: destination.threadId,
                xpertId,
                tenantId: RequestContext.currentTenantId(),
                organizationId: RequestContext.getOrganizationId() ?? IsNull(),
                purpose: 'private'
            },
            'contribute'
        )
    )
}

export async function persistConversationMonitor(
    repository: Repository<XpertTask>,
    queries: QueryBus,
    input: IXpertTask,
    target: MonitorCreation
) {
    const destination: MonitorDestination = target.destination ?? {
        type: 'conversation',
        conversationId: target.conversationId,
        threadId: target.threadId
    }
    if (destination.type === 'conversation')
        await requireMonitorTarget(queries, input, {
            conversationId: destination.conversationId,
            threadId: destination.threadId
        })
    const binding = monitorBinding(destination)
    const intervalMinutes = monitorInterval.parse(target.intervalMinutes ?? 30)
    const tenantId = RequestContext.currentTenantId()
    const organizationId = RequestContext.getOrganizationId() ?? null
    const userId = RequestContext.currentUserId()
    if (!userId || !tenantId) throw new ForbiddenException(t('server-ai:Error.ScheduleConversationUnavailable'))
    const id = uuid(
        JSON.stringify([
            tenantId,
            organizationId,
            userId,
            input.xpertId,
            input.agentKey,
            target.conversationId,
            target.threadId,
            target.source,
            target.requestKey
        ]),
        uuid.URL
    )
    const timeZone = input.timeZone || 'UTC'
    try {
        new Intl.DateTimeFormat('en', { timeZone })
    } catch {
        throw new BadRequestException(t('server-ai:ResourceCard.InvalidTimeZone'))
    }
    const { schedule, anchorAt } = monitorCadence(intervalMinutes)
    return repository.manager.transaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [id])
        const tasks = manager.getRepository(XpertTask)
        const existing = await tasks.findOneBy({ id, tenantId, runAsUserId: userId })
        if (existing) return existing
        return tasks.save(
            tasks.create({
                id,
                name: input.name,
                prompt: input.prompt,
                xpertId: input.xpertId,
                projectId: input.projectId,
                agentKey: input.agentKey,
                tenantId,
                organizationId,
                createdById: userId,
                runAsUserId: userId,
                timeZone,
                schedule,
                status: ScheduleTaskStatus.SCHEDULED,
                monitor: {
                    source: target.source,
                    ...binding,
                    intervalMinutes,
                    anchorAt,
                    notify: 'new-differences'
                }
            })
        )
    })
}
