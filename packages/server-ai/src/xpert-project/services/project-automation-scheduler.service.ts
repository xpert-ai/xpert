import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { CronTime } from 'cron'
import { InjectRepository } from '@nestjs/typeorm'
import { RedisLockService } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { XpertProjectAutomation } from '../entities/project-automation.entity'
import { XpertProjectAutomationService } from './project-automation.service'

const PROJECT_AUTOMATION_LOCK_KEY = 'scheduler:xpert-project-automation'
const PROJECT_AUTOMATION_LOCK_TTL = 5 * 60 * 1000

@Injectable()
export class XpertProjectAutomationSchedulerService {
    readonly #logger = new Logger(XpertProjectAutomationSchedulerService.name)

    constructor(
        @InjectRepository(XpertProjectAutomation) private readonly repository: Repository<XpertProjectAutomation>,
        private readonly automationService: XpertProjectAutomationService,
        private readonly redisLockService: RedisLockService
    ) {}

    @Cron('*/30 * * * * *')
    async scan() {
        // Legacy rows remain queryable, but only XpertTask is allowed to schedule new Project work.
        return
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
