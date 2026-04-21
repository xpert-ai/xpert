import type { Repository } from 'typeorm'
import { SandboxManagedServiceEntity } from './sandbox-managed-service.entity'
import { SandboxManagedServiceService } from './sandbox-managed-service.service'

describe('SandboxManagedServiceService', () => {
  let repository: {
    findOne: jest.Mock
  }
  let service: SandboxManagedServiceService

  beforeEach(() => {
    repository = {
      findOne: jest.fn()
    }

    service = new SandboxManagedServiceService(
      repository as unknown as Repository<SandboxManagedServiceEntity>,
      {} as never,
      {} as never
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
})
