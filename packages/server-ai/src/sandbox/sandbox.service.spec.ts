import type { ISandboxProvider, SandboxProviderRegistry } from '@xpert-ai/plugin-sdk'
import { Logger } from '@nestjs/common'
import { SandboxService } from './sandbox.service'

function provider(type: string, available?: boolean): ISandboxProvider {
    return {
        create: jest.fn(),
        getDefaultWorkingDir: () => '/workspace',
        ...(available === undefined ? {} : { isAvailable: () => available }),
        meta: {
            icon: { type: 'svg', value: '<svg />' },
            name: { en_US: type }
        },
        type
    }
}

describe('SandboxService', () => {
    it('hides unavailable providers without changing legacy provider availability', async () => {
        const registry = {
            list: jest.fn(() => [
                provider('local-shell-sandbox'),
                provider('nsjail', false),
                provider('docker-sandbox', true)
            ])
        }
        const service = new SandboxService(registry as unknown as SandboxProviderRegistry)

        expect((await service.listProviders()).map(({ type }) => type)).toEqual([
            'local-shell-sandbox',
            'docker-sandbox'
        ])
        await expect(service.getDefaultProviderType()).resolves.toBe('local-shell-sandbox')
    })

    it('logs and hides a provider whose availability check rejects', async () => {
        const brokenProvider = provider('broken-provider')
        brokenProvider.isAvailable = jest.fn().mockRejectedValue(new Error('health check failed'))
        const registry = {
            list: jest.fn(() => [brokenProvider, provider('local-shell-sandbox')])
        }
        const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation()
        const service = new SandboxService(registry as unknown as SandboxProviderRegistry)

        await expect(service.listProviders()).resolves.toEqual([
            expect.objectContaining({ type: 'local-shell-sandbox' })
        ])
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('broken-provider'))

        warnSpy.mockRestore()
    })
})
