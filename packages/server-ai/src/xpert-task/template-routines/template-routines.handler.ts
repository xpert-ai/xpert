import { Organization } from '@xpert-ai/server-core'
// Invariants: stable per-user IDs make retries recoverable. Import never schedules work;
// only an explicit authenticated update can enable a routine, through the existing scheduler.
import { BadRequestException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ScheduleTaskStatus, templateManifestSchema, type TemplateRoutineStatus } from '@xpert-ai/contracts'
import { DataSource } from 'typeorm'
import { CronTime } from 'cron'
import { v5 as uuid } from 'uuid'
import { t } from 'i18next'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'
import { AssistantUserPreferenceService } from '../../xpert/assistant-user-preference.service'
import { ResolveTemplateConnectorsCommand } from '../../connector/template-connectors.command'
import { TemplateRoutinesCommand } from './template-routines.command'
import { XpertTask } from '../xpert-task.entity'
import { XpertTaskService } from '../xpert-task.service'

@CommandHandler(TemplateRoutinesCommand)
export class TemplateRoutinesHandler implements ICommandHandler<TemplateRoutinesCommand> {
    constructor(
        private readonly database: DataSource,
        private readonly published: PublishedXpertAccessService,
        private readonly preferences: AssistantUserPreferenceService,
        private readonly tasks: XpertTaskService,
        private readonly commands: CommandBus
    ) {}

    async execute(command: TemplateRoutinesCommand): Promise<TemplateRoutineStatus[]> {
        const assistant = await this.published.getAccessiblePublishedXpertForCurrentUser(command.assistantId)
        const userId = RequestContext.currentUserId()
        const declared = assistant.options?.templateDefinition?.manifest ?? assistant.options?.templateSource?.manifest
        const manifest = declared ? templateManifestSchema.parse(declared) : undefined
        const routines = manifest?.routines ?? []
        const idFor = (key: string) => uuid(JSON.stringify([assistant.tenantId, userId, assistant.id, key]), uuid.URL)
        const repository = this.database.getRepository(XpertTask)
        const organization =
            routines.some((routine) => routine.timezone === 'organization') && assistant.organizationId
                ? await this.database.getRepository(Organization).findOne({
                      where: { id: assistant.organizationId, tenantId: assistant.tenantId },
                      select: ['timeZone']
                  })
                : undefined
        if (command.update) {
            const update = command.update
            const routine = routines.find((item) => item.key === update.key)
            if (!routine || routine.trigger !== 'schedule') this.invalid()
            try {
                new CronTime(update.expression, update.timeZone).sendAt()
            } catch {
                this.invalid()
            }
            if (update.enabled) {
                const state = await this.preferences.getDomain(assistant.id, 'templateSetup')
                if (manifest.onboarding?.required && !state?.completedAt) this.invalid()
                const { connectors } = await this.commands.execute(
                    new ResolveTemplateConnectorsCommand(
                        assistant.id,
                        manifest.connectors ?? [],
                        state?.connectors ?? {}
                    )
                )
                if (connectors.some((item) => item.required && item.status !== 'ready')) this.invalid()
            }
            const id = idFor(routine.key)
            await this.database.transaction(async (manager) => {
                await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [id])
                let task = await repository.findOne({
                    where: { id, tenantId: assistant.tenantId, runAsUserId: userId }
                })
                if (!task) {
                    task = await repository.save(
                        repository.create({
                            id,
                            tenantId: assistant.tenantId,
                            organizationId: assistant.organizationId,
                            createdById: userId,
                            runAsUserId: userId,
                            xpertId: assistant.id,
                            name: routine.key,
                            prompt: `Use the skill ${routine.skill}. Required result: ${routine.output}`,
                            status: ScheduleTaskStatus.PAUSED,
                            schedule: update.expression,
                            timeZone: update.timeZone
                        })
                    )
                }
                // Persist the disabled task first so a scheduler failure is safely retryable.
                await this.tasks.updateTask(task.id, {
                    schedule: update.expression,
                    options: null,
                    timeZone: update.timeZone,
                    status: update.enabled ? ScheduleTaskStatus.SCHEDULED : ScheduleTaskStatus.PAUSED
                })
            })
        }
        return Promise.all(
            routines.map(async (routine) => {
                const task = await repository.findOne({
                    where: { id: idFor(routine.key), tenantId: assistant.tenantId, runAsUserId: userId }
                })
                const enabled = task?.status === ScheduleTaskStatus.SCHEDULED
                const expression = task?.schedule ?? routine.expression
                const timeZone =
                    task?.timeZone ??
                    (routine.timezone === 'user' ? RequestContext.currentUser()?.timeZone : organization?.timeZone)
                return {
                    key: routine.key,
                    supported: routine.trigger === 'schedule',
                    skill: routine.skill,
                    output: routine.output,
                    taskId: task?.id,
                    enabled,
                    expression,
                    timeZone,
                    nextRunAt: enabled ? new CronTime(expression, timeZone).sendAt().toISO() : undefined
                }
            })
        )
    }

    private invalid(): never {
        throw new BadRequestException(t('server-ai:Error.TemplateRoutineInvalid'))
    }
}
