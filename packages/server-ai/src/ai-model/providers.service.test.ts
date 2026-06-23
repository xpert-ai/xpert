import { Test, TestingModule } from '@nestjs/testing'
import { AIModelProviderRegistry } from '@xpert-ai/plugin-sdk'
import { AIModelModule } from './ai-model.module'
import { AIProvidersService } from './ai-model.service'

describe('AIProviderModule', () => {
    let provider: AIProvidersService
    let pluginProviderRegistry: { get: jest.Mock }
    let pluginProvider: { getProviderSchema: jest.Mock }

    beforeAll(async () => {
        pluginProvider = {
            getProviderSchema: jest.fn()
        }
        pluginProviderRegistry = {
            get: jest.fn((name: string) => {
                if (name === 'plugin-provider') {
                    return pluginProvider
                }
                throw new Error('No plugin provider')
            })
        }

        const module: TestingModule = await Test.createTestingModule({
            imports: [AIModelModule]
        })
            .overrideProvider(AIModelProviderRegistry)
            .useValue(pluginProviderRegistry)
            .compile()

        provider = module.get<AIProvidersService>(AIProvidersService)
    })

    beforeEach(async () => {
        //
    })

    it('should be defined', () => {
        expect(provider).toBeDefined()
    })

    it('should not include removed built-in providers', async () => {
        expect(provider.getProvider('jina')).toBeUndefined()
        expect(provider.getProvider('ollama')).toBeUndefined()
    })

    it('should resolve plugin model providers', async () => {
        expect(provider.getProvider('plugin-provider')).toBe(pluginProvider)
        expect(pluginProviderRegistry.get).toHaveBeenCalledWith('plugin-provider', undefined)
    })
})
