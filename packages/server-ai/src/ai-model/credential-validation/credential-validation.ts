import {
    ProviderCredentialValidationCapabilities,
    ProviderCredentialValidationResult,
    ProviderCredentialValidationTarget
} from '@xpert-ai/contracts'
import { CredentialsValidateFailedError, getErrorMessage, type IAIModelProviderStrategy } from '@xpert-ai/plugin-sdk'
import { BadRequestException, HttpException } from '@nestjs/common'
import { t } from 'i18next'
import { ProviderCredentialSchemaValidator } from '../schema_validators'

type CredentialValidationProvider = Pick<
    IAIModelProviderStrategy,
    | 'discoverModels'
    | 'credentialValidation'
    | 'getProviderSchema'
    | 'getProviderModels'
    | 'getModelManager'
    | 'validateProviderCredentials'
>

export function credentialValidationCapabilities(
    strategy: CredentialValidationProvider
): ProviderCredentialValidationCapabilities {
    if (strategy.discoverModels) return { method: 'discovery' }
    if (strategy.credentialValidation?.mode === 'model') {
        const supported = strategy.getProviderSchema().supported_model_types
        const modelTypes = strategy.credentialValidation.modelTypes.filter((type) => supported.includes(type))
        const models = modelTypes.flatMap((modelType) =>
            strategy.getProviderModels(modelType).map(({ model }) => ({ model, modelType }))
        )
        return { method: 'model', modelTypes, models }
    }
    return { method: 'provider' }
}

/** Preview and persistence share this check; a browser's previous success is never trusted. */
export async function checkProviderCredentials(
    strategy: CredentialValidationProvider,
    credentials: Record<string, unknown>,
    target?: ProviderCredentialValidationTarget
): Promise<{ credentials: Record<string, unknown>; result: ProviderCredentialValidationResult }> {
    const schema = strategy.getProviderSchema().provider_credential_schema
    if (!schema) throw new BadRequestException(t('server-ai:Error.ProviderCredentialSchemaMissing'))
    const filtered = new ProviderCredentialSchemaValidator(schema).validateAndFilter(credentials)

    if (strategy.discoverModels) {
        try {
            const models = await strategy.discoverModels(filtered)
            return { credentials: filtered, result: { method: 'discovery', models } }
        } catch (error) {
            if (error instanceof HttpException) throw error
            throw new CredentialsValidateFailedError(getErrorMessage(error))
        }
    }
    if (strategy.credentialValidation?.mode === 'model') {
        if (
            !target ||
            !strategy.credentialValidation.modelTypes.includes(target.modelType) ||
            !strategy.getProviderSchema().supported_model_types.includes(target.modelType)
        ) {
            throw new BadRequestException(t('server-ai:Error.ProviderCredentialTargetRequired'))
        }
        await strategy.validateProviderCredentials(filtered)
        await strategy.getModelManager(target.modelType).validateCredentials(target.model, filtered)
        return { credentials: filtered, result: { method: 'model', target } }
    }
    await strategy.validateProviderCredentials(filtered)
    return { credentials: filtered, result: { method: 'provider' } }
}
