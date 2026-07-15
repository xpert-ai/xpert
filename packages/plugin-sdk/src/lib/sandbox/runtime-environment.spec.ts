import { isDevelopmentSandboxRuntimeEnvironment } from './runtime-environment'

describe('isDevelopmentSandboxRuntimeEnvironment', () => {
  it.each(['development', 'test'])('allows the explicit %s environment', (nodeEnv) => {
    expect(isDevelopmentSandboxRuntimeEnvironment({ NODE_ENV: nodeEnv })).toBe(true)
  })

  it.each([undefined, '', 'production', 'staging'])('fails closed for %s', (nodeEnv) => {
    expect(isDevelopmentSandboxRuntimeEnvironment(nodeEnv === undefined ? {} : { NODE_ENV: nodeEnv })).toBe(false)
  })
})
