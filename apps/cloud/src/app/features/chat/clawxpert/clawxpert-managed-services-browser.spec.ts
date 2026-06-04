import { of } from 'rxjs'
import {
  ClawXpertManagedServicesSandboxApi,
  createClawXpertManagedServicesBrowserController,
  formatManagedServiceDisplayUrl,
  resolveManagedServiceForAddress
} from './clawxpert-managed-services-browser'

const managedService = {
  id: 'service-1',
  conversationId: 'conversation-1',
  provider: 'local-shell-sandbox',
  name: 'web',
  command: 'npm run dev',
  workingDirectory: '/workspace/project-1',
  requestedPort: 4173,
  actualPort: 4173,
  previewPath: '/',
  previewUrl: '/api/sandbox/conversations/conversation-1/services/service-1/proxy/',
  status: 'running' as const,
  transportMode: 'http' as const
}

function createSandboxApiMock() {
  return {
    createManagedServicePreviewSession: jest.fn(() =>
      of({
        expiresAt: '2026-04-20T13:00:00.000Z',
        previewUrl: '/api/sandbox/conversations/conversation-1/services/service-1/proxy/'
      })
    ),
    getManagedServiceLogs: jest.fn(() =>
      of({
        stdout: 'ready',
        stderr: ''
      })
    ),
    listManagedServices: jest.fn(() => of([managedService])),
    restartManagedService: jest.fn(() => of(managedService)),
    stopManagedService: jest.fn(() => of({ ...managedService, status: 'stopped' as const }))
  } as unknown as jest.Mocked<ClawXpertManagedServicesSandboxApi>
}

describe('ClawXpertManagedServicesBrowserController', () => {
  it('does not call the sandbox API until explicitly refreshed or opened', () => {
    const sandboxApi = createSandboxApiMock()

    createClawXpertManagedServicesBrowserController(sandboxApi, {
      conversationId: 'conversation-1'
    })

    expect(sandboxApi.listManagedServices).not.toHaveBeenCalled()
    expect(sandboxApi.createManagedServicePreviewSession).not.toHaveBeenCalled()
  })

  it('resolves local managed service addresses', () => {
    expect(formatManagedServiceDisplayUrl(managedService)).toBe('localhost:4173')
    expect(resolveManagedServiceForAddress('localhost:4173', [managedService])).toBe(managedService)
    expect(resolveManagedServiceForAddress('http://localhost:4173/dashboard', [managedService])).toBe(managedService)
  })

  it('refreshes services and opens a preview session by address', async () => {
    const sandboxApi = createSandboxApiMock()
    const controller = createClawXpertManagedServicesBrowserController(sandboxApi, {
      conversationId: 'conversation-1'
    })

    await controller.refresh()
    const result = await controller.openByAddress('localhost:4173')

    expect(sandboxApi.listManagedServices).toHaveBeenCalledWith('conversation-1', undefined)
    expect(sandboxApi.createManagedServicePreviewSession).toHaveBeenCalledWith('conversation-1', 'service-1', undefined)
    expect(result).toEqual(
      expect.objectContaining({
        displayUrl: 'localhost:4173',
        previewUrl: '/api/sandbox/conversations/conversation-1/services/service-1/proxy/',
        service: managedService
      })
    )
    expect(controller.snapshot).toEqual(
      expect.objectContaining({
        previewSessionUrl: '/api/sandbox/conversations/conversation-1/services/service-1/proxy/',
        selectedServiceId: 'service-1',
        services: [managedService]
      })
    )
  })
})
