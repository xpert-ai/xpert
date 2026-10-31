import { Process, Processor } from '@nestjs/bull'
import { Interval } from '@nestjs/schedule'
import { Job } from 'bull'
import { DataSource } from 'typeorm'
import { getConfig } from '@xpert-ai/server-config'
import { AIPermissionsEnum, UserType } from '@xpert-ai/contracts'
import { User } from '@xpert-ai/server-core'
import { APP_PLATFORM_QUEUE, AppPlatformService } from './app-platform.service'
import { AppPlatformDelivery } from './app-platform-delivery.entity'
import { PlatformProvisionerService } from './platform-provisioner.service'
import { captureRequestContext, runWithCapturedRequestContext } from '../../shared/request-context'
import { appPlatformJobSchema } from './app-platform-job.schema'

@Processor(APP_PLATFORM_QUEUE)
export class AppPlatformWorker {
    private recovering = false
    private recoveryOffset = 0
    constructor(
        private readonly database: DataSource,
        private readonly platform: AppPlatformService,
        private readonly provisioner: PlatformProvisionerService
    ) {}
    @Process({ concurrency: 2 })
    run(job: Pick<Job<unknown>, 'data'>) {
        const data = appPlatformJobSchema.parse(job.data)
        return this.provisioner.provision(data.deliveryId, data.digest)
    }

    /** Verification is durable in User; this compensates missed events and lost queue dispatches. */
    @Interval(15000)
    async recover() {
        const config = getConfig().appPlatform
        if (!config || this.recovering || !this.database.isInitialized) return
        this.recovering = true
        try {
            const users = await this.database
                .getRepository(User)
                .createQueryBuilder('user')
                .innerJoinAndSelect('user.role', 'role')
                .innerJoinAndSelect(
                    'role.rolePermissions',
                    'grant',
                    'grant.enabled = true AND grant.permission = :permission AND grant.tenantId = user.tenantId',
                    { permission: AIPermissionsEnum.APPLICATION_USE }
                )
                .leftJoin(
                    AppPlatformDelivery,
                    'delivery',
                    'delivery.userId = user.id AND delivery.tenantId = user.tenantId AND delivery.platformKey = :platform',
                    { platform: config.definition.key }
                )
                .where('user.type = :type', { type: UserType.USER })
                .andWhere('user.isActive = true')
                .andWhere('user.emailVerified = true')
                .andWhere(
                    `(delivery.id IS NULL OR (
          EXISTS (SELECT 1 FROM jsonb_array_elements(delivery.apps) state WHERE state->>'status' NOT IN ('ready', 'disabled'))
          AND (delivery.retryAfter IS NULL OR delivery.retryAfter < NOW())))`
                )
                .orderBy('user.createdAt', 'ASC')
                .addOrderBy('user.id', 'ASC')
                .skip(this.recoveryOffset)
                .take(25)
                .getMany()
            this.recoveryOffset = users.length === 25 ? this.recoveryOffset + 25 : 0
            // Revalidate each account through the normal delivery service. Terminal job failures
            // retain explicit retry semantics; recovery only compensates missing dispatches.
            for (const user of users) {
                await runWithCapturedRequestContext(captureRequestContext({ user, tenantId: user.tenantId }), () =>
                    this.platform.ensureForCurrentUser()
                ).catch(() => undefined)
            }
        } finally {
            this.recovering = false
        }
    }
}
