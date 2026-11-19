import { RequestContext } from '@xpert-ai/plugin-sdk'
import { CommandBus } from '@nestjs/cqrs'
import { EntityManager, Repository } from 'typeorm'
import { AppPlatformDelivery } from '../plugin-resource/app-platform/app-platform-delivery.entity'
import { platformFailure } from '../plugin-resource/app-platform/platform-error'
import type { XpertProject } from '../xpert-project/entities/project.entity'
import { accountStorageLimit } from '../plugin-resource/app-platform/storage/platform-storage-limit'

export async function applicationResourcePolicy(manager: EntityManager, tenantId: string, userId: string) {
    const deliveries = await manager.getRepository(AppPlatformDelivery).find({ where: { tenantId, userId } })
    if (!deliveries.length) return null
    const { configuration } = deliveries[0]
    return {
        ...configuration.environment.plans[configuration.definition.entitlements.defaultPlanRef],
        maxStorageBytes: await accountStorageLimit(manager, deliveries)
    }
}

/** Enforces the account's versioned upload limit before persistence or parsing. */
export class AssertAppPlatformUploadCommand {
    constructor(readonly bytes: number) {}
}

export async function assertAppPlatformUpload(commands: Pick<CommandBus, 'execute'>, bytes: number) {
    await commands.execute(new AssertAppPlatformUploadCommand(bytes))
}

/** Every Project creation path shares this account lock, including plugin-owned Projects. */
export async function withAppPlatformProjectLimit<T>(
    repository: Repository<XpertProject>,
    create: () => Promise<T>
): Promise<T> {
    const tenantId = RequestContext.currentTenantId(),
        userId = RequestContext.currentUserId()
    if (!tenantId || !userId || !(await applicationResourcePolicy(repository.manager, tenantId, userId)))
        return create()
    const runner = repository.manager.connection.createQueryRunner()
    await runner.connect()
    const key = `app-platform-projects:${tenantId}:${userId}`
    try {
        await runner.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [key])
        const policy = await applicationResourcePolicy(runner.manager, tenantId, userId)
        if (!policy) return create()
        const count = await repository.countBy({ tenantId, ownerId: userId })
        if (count >= policy.maxProjects) throw platformFailure('application_project_limit', 409)
        return await create()
    } finally {
        try {
            await runner.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [key])
        } finally {
            await runner.release()
        }
    }
}
