import 'reflect-metadata'
import { PLUGIN_WEBHOOK_AUTH_METADATA_KEY, PluginWebhookAuthGuard } from './webhook'

describe('PluginWebhookAuthGuard', () => {
  it('validates plugin webhook metadata and attaches the principal context', async () => {
    class Controller {
      webhook() {}
    }
    Reflect.defineMetadata(
      PLUGIN_WEBHOOK_AUTH_METADATA_KEY,
      {
        provider: 'wechat_personal',
        integrationParam: 'integrationId',
        secretQueryParam: 'secret'
      },
      Controller.prototype.webhook
    )
    const request: {
      params: Record<string, string>
      query: Record<string, string>
      headers: Record<string, string>
      user?: unknown
    } = {
      params: {
        integrationId: 'integration-1'
      },
      query: {
        secret: 'opaque-secret'
      },
      headers: {
        accept: 'text/plain'
      }
    }
    const authService = {
      validateWebhookSecret: jest.fn().mockResolvedValue({
        user: {
          id: 'integration-user-1',
          tenantId: 'tenant-1',
          apiKey: {
            type: 'integration',
            entityId: 'integration-1'
          }
        },
        headers: {
          'tenant-id': 'tenant-1',
          'x-scope-level': 'tenant'
        }
      })
    }
    const guard = new PluginWebhookAuthGuard(authService)
    const context = {
      getHandler: () => Controller.prototype.webhook,
      getClass: () => Controller,
      switchToHttp: () => ({
        getRequest: () => request
      })
    }

    await expect(guard.canActivate(context as never)).resolves.toBe(true)

    expect(authService.validateWebhookSecret).toHaveBeenCalledWith({
      integrationId: 'integration-1',
      secret: 'opaque-secret',
      provider: 'wechat_personal'
    })
    expect(request.user).toEqual(
      expect.objectContaining({
        apiKey: expect.objectContaining({
          entityId: 'integration-1'
        })
      })
    )
    expect(request.headers).toEqual({
      accept: 'text/plain',
      'tenant-id': 'tenant-1',
      'x-scope-level': 'tenant'
    })
  })

  it('passes through routes without plugin webhook metadata', async () => {
    class Controller {
      list() {}
    }
    const guard = new PluginWebhookAuthGuard()
    const context = {
      getHandler: () => Controller.prototype.list,
      getClass: () => Controller,
      switchToHttp: () => ({
        getRequest: () => ({})
      })
    }

    await expect(guard.canActivate(context as never)).resolves.toBe(true)
  })
})
