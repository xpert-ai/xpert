jest.mock('@xpert-ai/plugin-sdk', () => ({ AIModelProviderRegistry: class AIModelProviderRegistry {} }))

import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { AIModelProviderRegistry } from '@xpert-ai/plugin-sdk'
import { ListModelProvidersQuery } from '../list-providers.query'
import { ListModelProvidersHandler } from './list-providers.handler'

describe('model provider plugin provenance', () => {
    it('projects exact registry provenance without changing the plugin-owned schema', async () => {
        const schema = { provider: 'provider-with-a-different-name' }
        const provider = { getProviderSchema: () => schema }
        const registry = {
            list: () => [provider],
            getSource: () => ({
                kind: 'plugin',
                pluginName: '@vendor/bundle',
                pluginVersion: '1.2.3',
                scopeKey: 'org:one'
            })
        }
        const module = await Test.createTestingModule({
            providers: [
                ListModelProvidersHandler,
                { provide: CommandBus, useValue: {} },
                { provide: AIModelProviderRegistry, useValue: registry }
            ]
        }).compile()
        expect(await module.get(ListModelProvidersHandler).execute(new ListModelProvidersQuery())).toEqual([
            {
                provider: schema.provider,
                plugin: { name: '@vendor/bundle', version: '1.2.3', scopeKey: 'org:one' }
            }
        ])
        expect(schema).toEqual({ provider: 'provider-with-a-different-name' })
        await module.close()
    })

    it('does not invent a plugin identity for a built-in provider', async () => {
        const registry = {
            list: () => [{ getProviderSchema: () => ({ provider: 'builtin' }) }],
            getSource: () => ({ kind: 'builtin', scopeKey: 'builtin:global' })
        }
        const module = await Test.createTestingModule({
            providers: [
                ListModelProvidersHandler,
                { provide: CommandBus, useValue: {} },
                { provide: AIModelProviderRegistry, useValue: registry }
            ]
        }).compile()
        expect(
            (await module.get(ListModelProvidersHandler).execute(new ListModelProvidersQuery()))[0].plugin
        ).toBeUndefined()
        expect(await module.get(ListModelProvidersHandler).execute(new ListModelProvidersQuery(['other']))).toEqual([])
        await module.close()
    })
})
