import {
    AIModelProviderNotFoundException,
    AIModelProviderRegistry,
    IAIModelProviderStrategy
} from '@xpert-ai/plugin-sdk'
import { Injectable, Inject } from '@nestjs/common'
import { t } from 'i18next'
import { ProviderCredentialSchemaValidator } from './schema_validators/'

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
        credentials: Record<string, any>
    ): Promise<Record<string, any>> {
        // Get the provider instance
        const modelProviderInstance = this.getProvider(provider, true)

        // Get the provider schema
        const providerSchema = modelProviderInstance.getProviderSchema()

        // Get provider_credential_schema and validate credentials according to the rules
        const providerCredentialSchema = providerSchema.provider_credential_schema

        if (!providerCredentialSchema) {
            throw new Error(`Provider ${provider} does not have provider_credential_schema`)
        }

        // Validate the provider credential schema
        const validator = new ProviderCredentialSchemaValidator(providerCredentialSchema)
        const filteredCredentials = validator.validateAndFilter(credentials)

        // Validate credentials, throw an exception if validation fails
        await modelProviderInstance.validateProviderCredentials(filteredCredentials)

        return filteredCredentials
    }
}
