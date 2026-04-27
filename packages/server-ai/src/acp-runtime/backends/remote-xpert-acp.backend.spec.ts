jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn()
  }
}))

import axios from 'axios'
import { RemoteXpertAcpBackend } from './remote-xpert-acp.backend'

describe('RemoteXpertAcpBackend', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('builds Codexpert headers only from ACP session businessPrincipal', async () => {
    ;(axios.create as jest.Mock).mockReturnValue({
      post: jest.fn().mockResolvedValue({
        data: {
          sessionId: 'remote-session-1'
        }
      })
    })
    const backend = new RemoteXpertAcpBackend()

    await backend.ensureSession({
      target: {
        id: 'target-1',
        commandOrEndpoint: 'http://codexpert.test/acp',
        authRef: 'token-1',
        metadata: {
          headers: {
            'x-principal-user-id': 'metadata-user'
          }
        }
      },
      session: {
        id: 'session-1',
        clientSessionId: 'client-session-1',
        metadata: {
          businessPrincipal: {
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1'
          },
          userId: 'legacy-user'
        },
        mode: 'oneshot'
      }
    } as any)

    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token-1',
          'tenant-id': 'tenant-1',
          'organization-id': 'org-1',
          'x-principal-user-id': 'user-1'
        })
      })
    )
  })

  it('fails before calling Codexpert when ACP session businessPrincipal is missing', async () => {
    const backend = new RemoteXpertAcpBackend()

    await expect(
      backend.ensureSession({
        target: {
          id: 'target-1',
          commandOrEndpoint: 'http://codexpert.test/acp'
        },
        session: {
          id: 'session-1',
          metadata: {
            userId: 'legacy-user'
          },
          mode: 'oneshot'
        }
      } as any)
    ).rejects.toThrow('Missing BusinessPrincipal from remote Codexpert ACP session')
    expect(axios.create).not.toHaveBeenCalled()
  })
})
