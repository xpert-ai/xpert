import {
  resolveSandboxManagedServiceAdapter,
  resolveSandboxServiceProxyAdapter
} from './managed-service'

describe('managed service sandbox resolvers', () => {
  it('resolves managed service adapters directly and through sandbox backends', () => {
    const adapter = {
      getServiceLogs: jest.fn(),
      listServices: jest.fn(),
      restartService: jest.fn(),
      startService: jest.fn(),
      stopService: jest.fn()
    }

    expect(resolveSandboxManagedServiceAdapter(adapter)).toBe(adapter)
    expect(resolveSandboxManagedServiceAdapter({ backend: adapter })).toBe(adapter)
    expect(resolveSandboxManagedServiceAdapter({ backend: { startService: jest.fn() } })).toBeNull()
  })

  it('resolves proxy adapters directly and through sandbox backends', () => {
    const adapter = {
      proxyServiceRequest: jest.fn()
    }

    expect(resolveSandboxServiceProxyAdapter(adapter)).toBe(adapter)
    expect(resolveSandboxServiceProxyAdapter({ backend: adapter })).toBe(adapter)
    expect(resolveSandboxServiceProxyAdapter({ backend: {} })).toBeNull()
  })
})
