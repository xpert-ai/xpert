import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { RefreshMembershipModelPolicyCommand } from '../../membership/refresh-membership-model-policy.command'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { getConfig } from '@xpert-ai/server-config'
import { User } from '@xpert-ai/server-core'
import { DataSource } from 'typeorm'
import { AppPlatformDelivery } from './app-platform-delivery.entity'
import { AppPlatformService } from './app-platform.service'
import { ApplicationInitializationLocks } from '../application/application-initialization-locks'
import { reconcilePlatformApps } from './platform-delivery-state'
import { assertPlatformResourceUpdate } from './platform-resource-update'
import { platformFailure } from './platform-error'
import { randomUUID } from 'node:crypto'

@Injectable()
export class PlatformUpdateService {
    constructor(
        private readonly database: DataSource,
        private readonly locks: ApplicationInitializationLocks,
        private readonly platform: AppPlatformService,
        private readonly commands: CommandBus
    ) {}

    private async operator() {
        const tenantId = RequestContext.currentTenantId()
        const userId = RequestContext.currentUserId()
        // Do not allow absent scope to become an unfiltered TypeORM lookup.
        if (!tenantId || !userId || RequestContext.currentApiPrincipal())
            throw platformFailure('application_update_forbidden', 403)
        const actor = await this.database
            .getRepository(User)
            .findOne({ where: { id: userId, tenantId }, relations: ['role'] })
        if (!actor || actor.isActive === false || !RequestContext.hasPermission(AIPermissionsEnum.APPLICATION_INSTALL))
            throw platformFailure('application_update_forbidden', 403)
        return { tenantId, actor }
    }

    async list(input: { userId?: string; skip: number; take: number }) {
        const { tenantId } = await this.operator()
        const config = getConfig().appPlatform
        if (!config) throw platformFailure('app_platform_not_configured')
        const [items, total] = await this.database.getRepository(AppPlatformDelivery).findAndCount({
            where: { tenantId, platformKey: config.definition.key, ...(input.userId ? { userId: input.userId } : {}) },
            select: ['id', 'userId', 'organizationId', 'definitionVersion', 'configurationDigest', 'apps', 'updatedAt'],
            order: { createdAt: 'ASC', id: 'ASC' },
            skip: input.skip,
            take: input.take
        })
        return { items, total }
    }

    /** Operators explicitly adopt the deployed definition. The browser cannot supply a definition or file path. */
    async adopt(deliveryId: string, expectedDigest: string) {
        const { tenantId, actor } = await this.operator()
        const config = getConfig().appPlatform
        if (!config) throw platformFailure('app_platform_not_configured')
        return this.locks.run(`platform:${deliveryId}`, async () => {
            const repository = this.database.getRepository(AppPlatformDelivery)
            const row = await repository.findOneBy({ id: deliveryId, tenantId, platformKey: config.definition.key })
            if (!row || row.configurationDigest !== expectedDigest)
                throw platformFailure('application_update_conflict', 409)
            if (row.configurationDigest === config.digest) return this.platform.status(row)
            // Finish the durable release before another definition can replace its snapshot.
            if (row.apps.some((app) => app.updateOperationId)) throw platformFailure('application_update_conflict', 409)
            if (config.definition.version <= row.definitionVersion)
                throw platformFailure('application_update_conflict', 409)
            for (const app of config.definition.apps) {
                const previous = row.configuration.definition.apps.find((item) => item.key === app.key)
                if (previous && JSON.stringify(previous.appRef) !== JSON.stringify(app.appRef))
                    throw platformFailure('application_update_conflict', 409)
            }
            assertPlatformResourceUpdate(row.configuration, config)
            if (
                row.configuration.definition.entitlements.defaultPlanRef !==
                config.definition.entitlements.defaultPlanRef
            )
                throw platformFailure('application_resource_migration_required', 409)
            row.apps = reconcilePlatformApps(config.definition, row.apps)
            for (const state of row.apps) {
                if (state.status === 'disabled' || !state.installationId) continue
                if (state.status === 'ready') state.appliedDigest ??= row.configurationDigest
                state.status = 'pending'
                state.updateOperationId = randomUUID()
                delete state.errorCode
            }
            row.configuration = config
            row.configurationDigest = config.digest
            row.definitionVersion = config.definition.version
            row.retryAfter = null
            await this.database.transaction(async (manager) => {
                await this.commands.execute(
                    new RefreshMembershipModelPolicyCommand(
                        {
                            tenantId,
                            userId: row.userId,
                            actorId: actor.id,
                            planCode: config.definition.entitlements.defaultPlanRef
                        },
                        manager
                    )
                )
                await manager.getRepository(AppPlatformDelivery).save(row)
            })
            await this.platform.enqueue(row, true)
            return this.platform.status(row)
        })
    }
}
