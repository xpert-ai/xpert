import { INTEGRATION_PROVIDERS } from './integration'
import { IntegrationEnum } from './integration.model'

describe('integration providers', () => {
  it('discovers GitHub through the built-in plugin instead of a static provider', () => {
    expect(INTEGRATION_PROVIDERS[IntegrationEnum.GITHUB]).toBeUndefined()
  })

  it('does not register the legacy built-in DingTalk provider', () => {
    expect(INTEGRATION_PROVIDERS[IntegrationEnum.DINGTALK]).toBeUndefined()
  })
})
