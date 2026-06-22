import { ConfigurateMethod, IAiProviderEntity } from '@xpert-ai/contracts'

type CustomModelProviderSchema = Partial<Pick<IAiProviderEntity, 'configurate_methods' | 'model_credential_schema'>>

export function canCreateCustomProviderModel(provider: CustomModelProviderSchema | null | undefined) {
  const modelCredentialSchema = provider?.model_credential_schema

  return (
    provider?.configurate_methods?.includes(ConfigurateMethod.CUSTOMIZABLE_MODEL) === true &&
    !!modelCredentialSchema?.model &&
    Array.isArray(modelCredentialSchema.credential_form_schemas)
  )
}
