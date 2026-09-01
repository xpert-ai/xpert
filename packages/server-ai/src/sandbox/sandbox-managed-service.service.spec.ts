jest.mock('@xpert-ai/plugin-sdk', () => ({
  ...jest.requireActual('@xpert-ai/plugin-sdk'),
  resolveSandboxServiceProxyAdapter: jest.fn()
}))

import { SandboxServiceProxyAdapter, resolveSandboxServiceProxyAdapter } from '@xpert-ai/plugin-sdk'
import type { Request, Response } from 'express'
import type { Repository } from 'typeorm'
import { SandboxManagedServiceEntity } from './sandbox-managed-service.entity'
import { SandboxManagedServiceService } from './sandbox-managed-service.service'

describe('SandboxManagedServiceService', () => {
  let repository: {
    findOne: jest.Mock
  }
  let conversationRepository: {
    findOneBy: jest.Mock
  }
  let sandboxConversationContextService: {
    resolveConversationSandbox: jest.Mock
  }
  let service: SandboxManagedServiceService

  beforeEach(() => {
    repository = {
      findOne: jest.fn()
    }
    conversationRepository = {
      findOneBy: jest.fn().mockResolvedValue({ id: 'conversation-1' })
    }
    sandboxConversationContextService = {
      resolveConversationSandbox: jest.fn().mockResolvedValue({
        provider: 'test-sandbox',
        sandbox: {}
      })
    }
    jest.mocked(resolveSandboxServiceProxyAdapter).mockReset()

    service = new SandboxManagedServiceService(
      repository as unknown as Repository<SandboxManagedServiceEntity>,
      conversationRepository as never,
      sandboxConversationContextService as never
    )
  })

  it('omits preview urls for non-running services', async () => {
    repository.findOne.mockResolvedValue({
      id: 'service-1',
      conversationId: 'conversation-1',
      provider: 'local-shell-sandbox',
      name: 'web',
      command: 'python -m http.server 8000',
      workingDirectory: '/workspace/project-1',
      requestedPort: 8000,
      actualPort: 8000,
      previewPath: '/',
      status: 'failed',
      runtimeRef: null,
      transportMode: 'http',
      ownerExecutionId: null,
      ownerAgentKey: null,
      startedAt: null,
      stoppedAt: new Date(),
      exitCode: 1,
      signal: null,
      metadata: null
    })

    await expect(service.getByConversationId('conversation-1', 'service-1')).resolves.toMatchObject({
      id: 'service-1',
      previewUrl: null,
      status: 'failed'
    })
  })

  it('isolates preview credentials and response cookies at the common proxy boundary', async () => {
    repository.findOne.mockResolvedValue({
      id: 'service-1',
      conversationId: 'conversation-1',
      provider: 'test-sandbox',
      name: 'web',
      command: 'npm run dev',
      workingDirectory: '/workspace/project-1',
      requestedPort: 4173,
      actualPort: 4173,
      previewPath: '/docs',
      status: 'running',
      runtimeRef: null,
      transportMode: 'http',
      ownerExecutionId: null,
      ownerAgentKey: null,
      startedAt: new Date(),
      stoppedAt: null,
      exitCode: null,
      signal: null,
      metadata: null
    })

    const request = {
      headers: {
        authorization: 'Bearer platform-token',
        cookie: 'xpert_sandbox_preview=session-token',
        'x-api-key': 'platform-api-key',
        'x-request-id': 'request-1'
      },
      headersDistinct: {
        authorization: ['Bearer platform-token'],
        cookie: ['xpert_sandbox_preview=session-token'],
        'x-api-key': ['platform-api-key'],
        'x-request-id': ['request-1']
      },
      rawHeaders: [
        'Authorization',
        'Bearer platform-token',
        'Cookie',
        'xpert_sandbox_preview=session-token',
        'X-Api-Key',
        'platform-api-key',
        'X-Request-Id',
        'request-1'
      ]
    } as unknown as Request
    const originalHeaders = request.headers
    const originalDistinctHeaders = request.headersDistinct
    const originalRawHeaders = request.rawHeaders
    const responseHeaders = new Map<string, Parameters<Response['setHeader']>[1]>()
    const originalSetHeader = jest.fn(function (
      this: Response,
      name: string,
      value: Parameters<Response['setHeader']>[1]
    ) {
      responseHeaders.set(name.toLowerCase(), value)
      return this
    })
    const response = {
      setHeader: originalSetHeader
    } as unknown as Response
    let proxiedHeaders: Request['headers'] | null = null
    let proxiedDistinctHeaders: Request['headersDistinct'] | null = null
    let proxiedRawHeaders: Request['rawHeaders'] | null = null
    const adapter: SandboxServiceProxyAdapter = {
      proxyServiceRequest: jest.fn(async (input) => {
        proxiedHeaders = { ...input.request.headers }
        proxiedDistinctHeaders = { ...input.request.headersDistinct }
        proxiedRawHeaders = [...input.request.rawHeaders]
        input.response.setHeader('Set-Cookie', 'sandbox-session=secret')
        input.response.setHeader('Service-Worker-Allowed', '/')
        input.response.setHeader('Location', '/login?next=/docs')
        input.response.setHeader('X-Upstream', 'sandbox')
      })
    }
    jest.mocked(resolveSandboxServiceProxyAdapter).mockReturnValue(adapter)

    await service.proxyByConversationId('conversation-1', 'service-1', '/', request, response)

    expect(proxiedHeaders).toEqual({
      'x-request-id': 'request-1'
    })
    expect(proxiedDistinctHeaders).toEqual({
      'x-request-id': ['request-1']
    })
    expect(proxiedRawHeaders).toEqual(['X-Request-Id', 'request-1'])
    expect(responseHeaders.has('set-cookie')).toBe(false)
    expect(responseHeaders.has('service-worker-allowed')).toBe(false)
    expect(responseHeaders.get('location')).toBe(
      '/api/sandbox/conversations/conversation-1/services/service-1/proxy/login?next=/docs'
    )
    expect(responseHeaders.get('x-upstream')).toBe('sandbox')
    expect(request.headers).toBe(originalHeaders)
    expect(request.headersDistinct).toBe(originalDistinctHeaders)
    expect(request.rawHeaders).toBe(originalRawHeaders)
    expect(response.setHeader).toBe(originalSetHeader)
  })

  it('restores the proxy request and response objects when a provider fails', async () => {
    repository.findOne.mockResolvedValue({
      id: 'service-1',
      conversationId: 'conversation-1',
      provider: 'test-sandbox',
      name: 'web',
      command: 'npm run dev',
      workingDirectory: '/workspace/project-1',
      requestedPort: 4173,
      actualPort: 4173,
      previewPath: '/',
      status: 'running',
      runtimeRef: null,
      transportMode: 'http',
      ownerExecutionId: null,
      ownerAgentKey: null,
      startedAt: new Date(),
      stoppedAt: null,
      exitCode: null,
      signal: null,
      metadata: null
    })

    const request = {
      headers: { authorization: 'Bearer platform-token' },
      headersDistinct: { authorization: ['Bearer platform-token'] },
      rawHeaders: ['Authorization', 'Bearer platform-token']
    } as unknown as Request
    const originalHeaders = request.headers
    const originalDistinctHeaders = request.headersDistinct
    const originalRawHeaders = request.rawHeaders
    const originalSetHeader = jest.fn(function (this: Response) {
      return this
    })
    const response = {
      setHeader: originalSetHeader
    } as unknown as Response
    const adapter: SandboxServiceProxyAdapter = {
      proxyServiceRequest: jest.fn(async () => {
        throw new Error('provider failed')
      })
    }
    jest.mocked(resolveSandboxServiceProxyAdapter).mockReturnValue(adapter)

    await expect(
      service.proxyByConversationId('conversation-1', 'service-1', '/', request, response)
    ).rejects.toThrow('provider failed')

    expect(request.headers).toBe(originalHeaders)
    expect(request.headersDistinct).toBe(originalDistinctHeaders)
    expect(request.rawHeaders).toBe(originalRawHeaders)
    expect(response.setHeader).toBe(originalSetHeader)
  })
})
