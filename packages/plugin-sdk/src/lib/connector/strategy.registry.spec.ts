import 'reflect-metadata'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Reflector } from '@nestjs/core'
import { ConnectorRuntimeCapability, ConnectorStrategyKey, ConnectorStrategyRegistry } from './index'
import type { ConnectorStrategy } from './index'

describe('ConnectorStrategyRegistry', () => {
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

    const registry = new ConnectorStrategyRegistry({} as any, new Reflector())
    const strategy = new ExampleConnectorStrategy()

    registry.upsert(strategy)

    expect(registry.get('example')).toBe(strategy)
    expect(registry.list()).toEqual([strategy])
    expect(ConnectorRuntimeCapability.id).toBe('platform.connector')
  })
})
