import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { CronTime } from 'cron'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { XpertProjectAutomation } from '../entities/project-automation.entity'
import { XpertProjectAutomationService } from './project-automation.service'

@Injectable()
export class XpertProjectAutomationSchedulerService {
    readonly #logger = new Logger(XpertProjectAutomationSchedulerService.name)
    readonly #lockKey = 87124931

    constructor(
        @InjectRepository(XpertProjectAutomation) private readonly repository: Repository<XpertProjectAutomation>,
        private readonly automationService: XpertProjectAutomationService
    ) {}

    @Cron('*/30 * * * * *')
    async scan() {
        const queryRunner = this.repository.manager.connection.createQueryRunner()
        await queryRunner.connect()
        try {
            const [{ locked }] = (await queryRunner.query('SELECT pg_try_advisory_lock($1) AS locked', [
                this.#lockKey
            ])) as Array<{ locked: boolean }>
            if (!locked) return
            const due = await this.repository
                .createQueryBuilder('automation')
                .where('automation.enabled = :enabled', { enabled: true })
                .andWhere("automation.trigger ->> 'type' = 'schedule'")
                .andWhere('(automation.nextRunAt IS NULL OR automation.nextRunAt <= :now)', { now: new Date() })
                .take(100)
                .getMany()
            for (const automation of due) {
                try {
                    const occurrenceKey = `${automation.id}:${automation.nextRunAt?.toISOString() ?? new Date().toISOString()}`
                    await this.automationService.run(automation.projectId, automation.id, occurrenceKey)
                    const now = new Date()
                    automation.lastRunAt = now
                    automation.nextRunAt = nextScheduleDate(automation.trigger?.cron, automation.trigger?.timezone, now)
                    await this.repository.save(automation)
                } catch (error) {
                    this.#logger.warn(
                        `Automation ${automation.id} was not scheduled: ${error instanceof Error ? error.message : String(error)}`
                    )
                }
            }
        } finally {
            await queryRunner.query('SELECT pg_advisory_unlock($1)', [this.#lockKey]).catch(() => undefined)
            await queryRunner.release()
        }
    }
}

function nextScheduleDate(cron: string | undefined, timezone: string | undefined, reference: Date) {
    if (!cron) return new Date(reference.getTime() + 60_000)
    try {
        return new CronTime(cron, timezone || 'UTC').getNextDateFrom(reference, timezone || 'UTC').toJSDate()
    } catch {
        // Keep an invalid schedule from being retried every 30 seconds.
        return new Date(reference.getTime() + 24 * 60 * 60 * 1000)
    }
}
