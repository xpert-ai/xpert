import { SandboxAcquireBackendHandler } from './acquire-backend.handler'
import { SandboxAcquireBackendCommand } from '../acquire-backend.command'
import type { SandboxProviderRegistry } from '@xpert-ai/plugin-sdk'

describe('SandboxAcquireBackendHandler', () => {
    let registry: {
        get: jest.Mock
    }
    let provider: {
        create: jest.Mock
    }
    let handler: SandboxAcquireBackendHandler

    beforeEach(() => {
        provider = {
            create: jest.fn()
        }
        registry = {
            get: jest.fn(() => provider)
        }
        handler = new SandboxAcquireBackendHandler(registry as unknown as SandboxProviderRegistry)
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('reuses the same backend when scope and working directory are unchanged', async () => {
        const backend = {
            id: 'sandbox-a',
            execute: jest.fn()
        }
        provider.create.mockResolvedValue(backend)

        const command = new SandboxAcquireBackendCommand({
            tenantId: 'tenant-1',
            provider: 'local-shell-sandbox',
            workingDirectory: '/workspace/a',
            workFor: {
                type: 'user',
                id: 'user-1'
            }
        })

        const first = await handler.execute(command)
        const second = await handler.execute(command)

        expect(registry.get).toHaveBeenCalledTimes(1)
        expect(provider.create).toHaveBeenCalledTimes(1)
        expect(first).toEqual({
            provider: 'local-shell-sandbox',
            workingDirectory: '/workspace/a',
            backend
        })
        expect(second).toBe(first)
    })

    it('creates distinct backends for different working directories in the same scope', async () => {
        const backendA = {
            id: 'sandbox-a',
            execute: jest.fn()
        }
        const backendB = {
            id: 'sandbox-b',
            execute: jest.fn()
        }
        provider.create.mockResolvedValueOnce(backendA).mockResolvedValueOnce(backendB)

        const first = await handler.execute(
            new SandboxAcquireBackendCommand({
                tenantId: 'tenant-1',
                provider: 'local-shell-sandbox',
                workingDirectory: '/workspace/a',
                workFor: {
                    type: 'user',
                    id: 'user-1'
                }
            })
        )
        const second = await handler.execute(
            new SandboxAcquireBackendCommand({
                tenantId: 'tenant-1',
                provider: 'local-shell-sandbox',
                workingDirectory: '/workspace/b',
                workFor: {
                    type: 'user',
                    id: 'user-1'
                }
            })
        )

        expect(provider.create).toHaveBeenCalledTimes(2)
        expect(first).toEqual({
            provider: 'local-shell-sandbox',
            workingDirectory: '/workspace/a',
            backend: backendA
        })
        expect(second).toEqual({
            provider: 'local-shell-sandbox',
            workingDirectory: '/workspace/b',
            backend: backendB
        })
    })

    it('throws when provider is omitted', async () => {
        await expect(
            handler.execute(
            new SandboxAcquireBackendCommand({
                tenantId: 'tenant-1',
                workingDirectory: '/workspace/default',
                workFor: {
                    type: 'user',
                    id: 'user-1'
                }
            })
        )
        ).rejects.toThrow('Sandbox provider is required')
        expect(registry.get).not.toHaveBeenCalled()
    })
})
