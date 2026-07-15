import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { SandboxProviderRegistry } from '@xpert-ai/plugin-sdk'

@Injectable()
export class SandboxService {
    private readonly logger = new Logger(SandboxService.name)

    constructor(private readonly registry: SandboxProviderRegistry) {}

    async listProviders() {
        const providers = await this.getAvailableProviders()
        return providers.map((provider) => ({ type: provider.type, meta: provider.meta }))
    }

    async getDefaultProviderType(): Promise<string | null> {
        return (await this.getAvailableProviders())[0]?.type ?? null
    }

    @Cron('0 0 * * * *')
    cleanCron() {
        this.logger.debug('Called when the current second is 45')
    }

    private async getAvailableProviders() {
        const providers = this.registry.list()
        const availability = await Promise.all(
            providers.map(async (provider) => {
                if (!provider.isAvailable) {
                    return true
                }
                try {
                    return await provider.isAvailable()
                } catch (error) {
                    this.logger.warn(
                        `Sandbox provider "${provider.type}" availability check failed: ${
                            error instanceof Error ? error.message : String(error)
                        }`
                    )
                    return false
                }
            })
        )
        return providers.filter((_provider, index) => availability[index])
    }
}
