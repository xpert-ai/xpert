import { ConfigurateMethod } from '@xpert-ai/contracts'
import { canCreateCustomProviderModel } from './provider-schema'

describe('canCreateCustomProviderModel', () => {
  it('rejects providers without custom model support', () => {
    expect(
      canCreateCustomProviderModel({
        configurate_methods: []
      })
    ).toBe(false)
  })

  it('rejects providers that declare custom models without a model credential schema', () => {
    expect(
      canCreateCustomProviderModel({
        configurate_methods: [ConfigurateMethod.CUSTOMIZABLE_MODEL]
      })
    ).toBe(false)
  })

  it('accepts customizable providers with a complete model credential schema', () => {
    expect(
      canCreateCustomProviderModel({
        configurate_methods: [ConfigurateMethod.CUSTOMIZABLE_MODEL],
        model_credential_schema: {
          model: {
            label: { en_US: 'Model Name' },
            placeholder: { en_US: 'Enter model name' }
          },
          credential_form_schemas: []
        }
      })
    ).toBe(true)
  })
})
