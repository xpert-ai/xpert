import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { SandboxProviderRegistry } from '@xpert-ai/plugin-sdk'

@Injectable()
export class SandboxService {
    private readonly logger = new Logger(SandboxService.name)

    constructor(private readonly registry: SandboxProviderRegistry) {}

    listProviders() {
        return this.registry.list().map((provider) => ({
            type: provider.type,
            meta: provider.meta
        }))
    }

    getDefaultProviderType(): string | null {
        return this.registry.list()[0]?.type ?? null
    }

    @Cron('0 0 * * * *')
    cleanCron() {
        this.logger.debug('Called when the current second is 45')
    }
}
