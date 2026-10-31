import { CommandBus } from '@nestjs/cqrs'
import { EntityManager } from 'typeorm'
import { AppPlatformDelivery } from '../plugin-resource/app-platform/app-platform-delivery.entity'

export async function applicationResourcePolicy(manager: EntityManager, tenantId: string, userId: string) {
    const delivery = await manager.getRepository(AppPlatformDelivery).findOneBy({ tenantId, userId })
    if (!delivery) return null
    return delivery.configuration.environment.plans[delivery.configuration.definition.entitlements.defaultPlanRef]
}

/** Enforces the account's versioned upload limit before persistence or parsing. */
export class AssertAppPlatformUploadCommand {
    constructor(readonly bytes: number) {}
}

export async function assertAppPlatformUpload(commands: Pick<CommandBus, 'execute'>, bytes: number) {
    await commands.execute(new AssertAppPlatformUploadCommand(bytes))
}
