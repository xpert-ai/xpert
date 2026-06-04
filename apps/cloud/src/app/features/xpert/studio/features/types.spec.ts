import { resolveSandboxFeatureForToggle } from './types'

describe('xpert studio feature helpers', () => {
  it('adds the first sandbox provider when enabling without a provider', () => {
    expect(
      resolveSandboxFeatureForToggle(true, { enabled: false }, [
        {
          type: 'local-shell-sandbox'
        },
        {
          type: 'docker-sandbox'
        }
      ])
    ).toEqual({
      enabled: true,
      provider: 'local-shell-sandbox'
    })
  })

  it('keeps an existing sandbox provider when enabling', () => {
    expect(
      resolveSandboxFeatureForToggle(true, { enabled: false, provider: 'docker-sandbox' }, [
        {
          type: 'local-shell-sandbox'
        },
        {
          type: 'docker-sandbox'
        }
      ])
    ).toEqual({
      enabled: true,
      provider: 'docker-sandbox'
    })
  })
})
