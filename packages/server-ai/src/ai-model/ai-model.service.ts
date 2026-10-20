import {
    AIModelProviderNotFoundException,
    AIModelProviderRegistry,
    IAIModelProviderStrategy,
    RequestContext
} from '@xpert-ai/plugin-sdk'
import { Injectable, Inject } from '@nestjs/common'
import { t } from 'i18next'
import { ProviderCredentialCheckInput, ProviderCredentialValidationTarget } from '@xpert-ai/contracts'
import {
    checkProviderCredentials,
    credentialValidationCapabilities
} from './credential-validation/credential-validation'

@Injectable()
export class AIProvidersService {
    @Inject(AIModelProviderRegistry)
    private readonly strategyRegistry: AIModelProviderRegistry

    /**
     * Find available model provider from plugin strategies.
     *
     * @param name
     * @param throwError
     * @returns
     */
    getProvider(name: string, throwError = false, organizationId?: string): IAIModelProviderStrategy | undefined {
        if (name) {
            try {
                return this.strategyRegistry.get(name, organizationId)
            } catch (error) {
                //
            }
        }
        if (throwError) {
            throw new AIModelProviderNotFoundException(t('server-ai:Error.AIModelProviderNotFound', { name }))
        }
        return undefined
    }

    async providerCredentialsValidate(
        provider: string,
        credentials: Record<string, unknown>,
        target?: ProviderCredentialValidationTarget
    ): Promise<Record<string, any>> {
        const strategy = this.getProvider(provider, true, RequestContext.getOrganizationId())
        return (await checkProviderCredentials(strategy, credentials, target)).credentials
    }

    credentialValidationCapabilities(provider: string) {
        return credentialValidationCapabilities(this.getProvider(provider, true, RequestContext.getOrganizationId()))
    }

    async checkCredentials(provider: string, input: ProviderCredentialCheckInput) {
        const strategy = this.getProvider(provider, true, RequestContext.getOrganizationId())
        return (await checkProviderCredentials(strategy, input.credentials, input.validationTarget)).result
    }
}
