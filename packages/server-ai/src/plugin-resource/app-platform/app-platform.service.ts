import { platformFailure } from './platform-error'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { InjectQueue } from '@nestjs/bull'
import { Queue } from 'bull'
import { DataSource, In, Repository } from 'typeorm'
import { getConfig } from '@xpert-ai/server-config'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { User, UserOrganization } from '@xpert-ai/server-core'
import { AppPlatformDelivery } from './app-platform-delivery.entity'
import {
    platformAppAvailable,
    platformNeedsProvision,
    platformReady,
    reconcilePlatformApps
} from './platform-delivery-state'
import { PluginApplicationInstallation } from '../plugin-application-installation.entity'
import { Xpert } from '../../xpert/xpert.entity'
import { applicationAssistantResources } from '../application/application-assistant-resources'

export const APP_PLATFORM_QUEUE = 'app-platform-delivery'
export type AppPlatformJob = { deliveryId: string; digest: string }

// Delivery snapshots change only through explicit adoption; login may resume initialization.
// Queue identity includes the snapshot digest so different releases cannot share a job.
@Injectable()
export class AppPlatformService {
    constructor(
        private readonly database: DataSource,
        @InjectRepository(AppPlatformDelivery) private readonly deliveries: Repository<AppPlatformDelivery>,
        @InjectQueue(APP_PLATFORM_QUEUE) private readonly queue: Queue<AppPlatformJob>
    ) {}

    presentation() {
        const config = getConfig().appPlatform
        return config
            ? { mode: 'managed-apps' as const, branding: config.definition.branding }
            : { mode: 'standard' as const }
    }

    private async currentIdentity() {
        const tenantId = RequestContext.currentTenantId(),
            userId = RequestContext.currentUserId()
        if (!tenantId || !userId || RequestContext.currentApiPrincipal())
            throw platformFailure('application_user_required', 403)
        const user = await this.database
            .getRepository(User)
            .findOne({
                where: { id: userId, tenantId, emailVerified: true },
                relations: ['role', 'role.rolePermissions']
            })
        if (!user || user.isActive === false || !RequestContext.hasPermission(AIPermissionsEnum.APPLICATION_USE))
            throw platformFailure('application_user_required', 403)
        const memberships = await this.database.getRepository(UserOrganization).find({
            where: {
                userId,
                tenantId,
                isActive: true,
                organization: { isActive: true }
            },
            take: 2
        })
        if (memberships.length !== 1) throw platformFailure('application_organization_required', 403)
        const organizationId = memberships[0].organizationId
        const requested = RequestContext.getOrganizationId()
        if (requested && requested !== organizationId) throw platformFailure('application_organization_denied', 403)
        return { tenantId, organizationId, userId }
    }

    async ensureForCurrentUser(retry = false) {
        const identity = await this.currentIdentity()
        const config = getConfig().appPlatform
        if (!config) throw platformFailure('app_platform_not_configured')
        let row = await this.deliveries.findOneBy({
            tenantId: identity.tenantId,
            userId: identity.userId,
            platformKey: config.definition.key
        })
        if (!row) {
            await this.deliveries
                .createQueryBuilder()
                .insert()
                .values({
                    ...identity,
                    platformKey: config.definition.key,
                    definitionVersion: config.definition.version,
                    configurationDigest: config.digest,
                    configuration: config,
                    apps: reconcilePlatformApps(config.definition, []),
                    createdById: identity.userId
                })
                .orIgnore()
                .execute()
            row = await this.deliveries.findOneByOrFail({
                tenantId: identity.tenantId,
                userId: identity.userId,
                platformKey: config.definition.key
            })
        }
        if (row.organizationId !== identity.organizationId)
            throw platformFailure('application_organization_denied', 403)
        // Ordinary login never upgrades an organization's immutable product snapshot.
        if (retry || platformNeedsProvision(row.apps)) await this.enqueue(row, retry)
        return this.status(row)
    }

    async enqueue(row: AppPlatformDelivery, retry = false) {
        const jobId = `${row.id}-${row.configurationDigest}`
        const existing = await this.queue.getJob(jobId)
        if (existing) {
            const state = await existing.getState()
            if (state === 'failed' && retry) await existing.retry()
            else if (state === 'completed' && retry) {
                await existing.remove()
                await this.queue.add(
                    { deliveryId: row.id, digest: row.configurationDigest },
                    {
                        jobId,
                        attempts: 3,
                        backoff: { type: 'exponential', delay: 5000 },
                        removeOnComplete: true,
                        removeOnFail: 100
                    }
                )
            }
            return
        }
        await this.queue.add(
            { deliveryId: row.id, digest: row.configurationDigest },
            {
                jobId,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: true,
                removeOnFail: 100
            }
        )
    }

    async status(row: AppPlatformDelivery) {
        const definition = row.configuration.definition
        const ids = row.apps.flatMap((app) => (app.installationId ? [app.installationId] : []))
        const installations = ids.length
            ? await this.database.getRepository(PluginApplicationInstallation).findBy({
                  id: In(ids),
                  tenantId: row.tenantId,
                  organizationId: row.organizationId
              })
            : []
        const entryIds = installations.flatMap((installation) =>
            applicationAssistantResources(installation).map((entry) => entry.id)
        )
        const assistants = entryIds.length
            ? await this.database
                  .getRepository(Xpert)
                  .find({
                      where: { id: In(entryIds), tenantId: row.tenantId, organizationId: row.organizationId },
                      select: ['id', 'slug', 'title', 'name', 'publishAt', 'workspaceId']
                  })
            : []
        return {
            mode: 'managed-apps' as const,
            branding: definition.branding,
            platformKey: row.platformKey,
            version: row.definitionVersion,
            organizationId: row.organizationId,
            home: definition.experience.home,
            ready: !!row.readyAt || platformReady(definition, row.apps),
            apps: definition.experience.navigation.map((key) => {
                const app = definition.apps.find((candidate) => candidate.key === key)
                const state = row.apps.find((candidate) => candidate.key === key)
                const installation = installations.find((candidate) => candidate.id === state?.installationId)
                return {
                    key,
                    required: app.required,
                    status: state?.status ?? 'pending',
                    errorCode: state?.errorCode,
                    entries:
                        app.enabled && platformAppAvailable(state) && installation
                            ? applicationAssistantResources(installation).flatMap((entry) => {
                                  const assistant = assistants.find(
                                      (candidate) =>
                                          candidate.id === entry.id &&
                                          candidate.publishAt &&
                                          candidate.workspaceId === installation.workspaceId
                                  )
                                  return assistant
                                      ? [
                                            {
                                                key: entry.key,
                                                id: assistant.id,
                                                slug: assistant.slug,
                                                title: assistant.title || assistant.name
                                            }
                                        ]
                                      : []
                              })
                            : []
                }
            })
        }
    }
}
