import 'reflect-metadata'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Reflector } from '@nestjs/core'
import {
  assertConnectorDefinition,
  ConnectorRuntimeCapability,
  ConnectorStrategyKey,
  ConnectorStrategyRegistry,
  getConnectorAuthMethods
} from './index'
import type { ConnectorMultiAuthDefinition, ConnectorMultiAuthStrategy, ConnectorStrategy } from './index'

describe('ConnectorStrategyRegistry', () => {
  const createRegistry = () => new ConnectorStrategyRegistry({ getProviders: () => [] } as never, new Reflector())

  it('keeps connector contracts owned by plugin-sdk', () => {
    const packageJson = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }

    expect(packageJson.dependencies).not.toHaveProperty('@xpert-ai/xpert-sdk')
  })

  it('resolves connector strategies by provider key', () => {
    @ConnectorStrategyKey('example')
    class ExampleConnectorStrategy implements ConnectorStrategy {
      readonly definition = {
        provider: 'example',
        label: 'Example Connector',
        auth: { type: 'oauth2' as const },
        appCredentials: {
          fields: [
            {
              name: 'appId',
              label: 'App ID'
            }
          ]
        }
      }

      async buildAuthorizationUrl() {
        return { authorizationUrl: 'https://oauth.example.com/authorize' }
      }

      async exchangeOAuthCode() {
        return {
          appId: 'cli_test',
          accessToken: 'uat_test'
        }
      }
    }

    const registry = createRegistry()
    const strategy = new ExampleConnectorStrategy()

    registry.upsert(strategy)

    expect(registry.get('example')).toBe(strategy)
    expect(registry.list()).toEqual([strategy])
    expect(ConnectorRuntimeCapability.id).toBe('platform.connector')
  })

  it('exposes multi-auth strategies through runtime accessors', () => {
    @ConnectorStrategyKey('multi-auth')
    class MultiAuthConnectorStrategy implements ConnectorMultiAuthStrategy {
      readonly definition: ConnectorMultiAuthDefinition = {
        provider: 'multi-auth',
        label: 'Multi-auth Connector',
        authMethods: [{ id: 'token', type: 'api_key', label: 'Token', credentials: {} }]
      }

      async connect() {
        return {
          status: 'active' as const,
          credential: { data: { token: 'secret' } }
        }
      }
    }

    const registry = createRegistry()
    const strategy = new MultiAuthConnectorStrategy()

    registry.upsert(strategy)

    expect(registry.getRuntime('multi-auth')).toBe(strategy)
    expect(registry.listRuntime()).toEqual([strategy])
    expect(() => registry.get('multi-auth')).toThrow('does not implement the legacy OAuth contract')
    expect(registry.list()).toEqual([])
  })

  it('normalizes a legacy single OAuth definition', () => {
    expect(
      getConnectorAuthMethods({
        provider: 'legacy',
        label: 'Legacy',
        auth: { type: 'oauth2' }
      })
    ).toEqual([
      expect.objectContaining({
        id: 'oauth2',
        type: 'oauth2'
      })
    ])
  })

  it('rejects duplicate authentication method ids', () => {
    expect(() =>
      assertConnectorDefinition({
        provider: 'duplicate',
        label: 'Duplicate',
        authMethods: [
          { id: 'token', type: 'api_key', label: 'Token', credentials: {} },
          { id: 'token', type: 'oauth2', label: 'OAuth' }
        ]
      })
    ).toThrow("duplicate authentication method id 'token'")
  })

  it('rejects unknown authentication method types at runtime', () => {
    const definition = {
      provider: 'unknown',
      label: 'Unknown',
      authMethods: [{ id: 'unknown', type: 'unknown', label: 'Unknown' }]
    }

    expect(() => assertConnectorDefinition(definition)).toThrow('unsupported authentication method type')
  })

  it('validates decorated function providers', () => {
    @ConnectorStrategyKey('function-provider')
    class FunctionConnectorStrategy {
      static readonly definition = {
        provider: 'function-provider',
        label: 'Function Provider',
        authMethods: [
          { id: 'token', type: 'api_key', label: 'Token', credentials: {} },
          { id: 'token', type: 'oauth2', label: 'OAuth' }
        ]
      }
    }

    expect(() => createRegistry().upsert(FunctionConnectorStrategy)).toThrow(
      "duplicate authentication method id 'token'"
    )
  })

  it('validates definitions carried by metatype providers', () => {
    @ConnectorStrategyKey('metatype-provider')
    class MetatypeConnectorStrategy {}

    const provider = {
      metatype: MetatypeConnectorStrategy,
      definition: {
        provider: 'metatype-provider',
        label: 'Metatype Provider',
        legacyAuthMethodId: 'token',
        authMethods: [{ id: 'token', type: 'api_key', label: 'Token', credentials: {} }]
      }
    }

    expect(() => createRegistry().upsert(provider)).toThrow(
      'must map legacy credentials to an OAuth authentication method'
    )
  })

  it('rejects decorated providers without a connector definition', () => {
    @ConnectorStrategyKey('missing-definition')
    class MissingDefinitionConnectorStrategy {}

    expect(() => createRegistry().upsert(new MissingDefinitionConnectorStrategy())).toThrow(
      "Connector strategy 'missing-definition' must expose a connector definition"
    )
  })

  it('rejects connector definitions whose provider differs from the registry key', () => {
    @ConnectorStrategyKey('registered-provider')
    class MismatchedConnectorStrategy {
      readonly definition = {
        provider: 'declared-provider',
        label: 'Mismatched Provider',
        auth: { type: 'oauth2' as const }
      }
    }

    expect(() => createRegistry().upsert(new MismatchedConnectorStrategy())).toThrow(
      "Connector strategy 'registered-provider' definition declares provider 'declared-provider'"
    )
  })

  it('ignores unrelated provider shapes', () => {
    class UnrelatedProvider {}
    const registry = createRegistry()

    for (const provider of [
      'provider-value',
      UnrelatedProvider,
      new UnrelatedProvider(),
      { metatype: UnrelatedProvider }
    ]) {
      expect(() => registry.upsert(provider)).not.toThrow()
    }

    expect(registry.listRuntime()).toEqual([])
  })

  it('rejects unknown legacy authentication method mappings', () => {
    expect(() =>
      assertConnectorDefinition({
        provider: 'legacy-mapping',
        label: 'Legacy Mapping',
        legacyAuthMethodId: 'missing',
        authMethods: [{ id: 'oauth', type: 'oauth2', label: 'OAuth' }]
      })
    ).toThrow("maps legacy credentials to unknown authentication method 'missing'")
  })
})
