import { INTEGRATION_PROVIDERS } from './integration'
import { IntegrationEnum } from './integration.model'

describe('integration providers', () => {
  it('does not register the legacy built-in DingTalk provider', () => {
    expect(INTEGRATION_PROVIDERS[IntegrationEnum.DINGTALK]).toBeUndefined()
  })
})
