import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { ContentCatalogService } from '../../catalog/content-catalog.service'
import { ContentEditorsService } from '../../content-editors.service'
import { ResolveProjectResourceNavigationCommand } from '../resolve-project-resource-navigation.command'
import { ResolveProjectResourceNavigationHandler } from './resolve-project-resource-navigation.handler'

it('publishes only the authorized resource implementation icon and retains navigation authorization', async () => {
    const icon = { type: 'emoji', value: '📊' }
    const identity = { typeId: 'example.chart', modelId: 'example.model', schemaVersion: '1' }
    const item = { ...identity, title: 'Title', resourceRef: { providerKey: 'example.content', resourceId: 'source' } }
    const execute = jest.fn(),
        get = jest.fn().mockResolvedValue(item),
        resolve = jest.fn().mockResolvedValue({ viewKey: 'document' })
    const types = jest.fn().mockResolvedValue([
        { ...identity, providerKey: 'another.plugin', icon: { type: 'emoji', value: '❌' } },
        { ...identity, providerKey: 'example.content', icon }
    ])
    const module = await Test.createTestingModule({
        providers: [
            ResolveProjectResourceNavigationHandler,
            { provide: CommandBus, useValue: { execute } },
            { provide: ContentCatalogService, useValue: { get, types } },
            { provide: ContentEditorsService, useValue: { resolve } }
        ]
    }).compile()
    const handler = module.get(ResolveProjectResourceNavigationHandler)
    const scope = {
        actor: { tenantId: 'tenant', organizationId: 'org', userId: 'user' },
        projectId: 'project',
        assistantId: 'assistant'
    }
    const command = new ResolveProjectResourceNavigationCommand(scope, 'content')
    expect(await handler.execute(command)).toEqual({ title: 'Title', icon, navigation: { viewKey: 'document' } })
    types.mockResolvedValue([])
    expect(await handler.execute(command)).not.toHaveProperty('icon')
    resolve.mockRejectedValue(new Error('Access revoked'))
    await expect(handler.execute(command)).rejects.toThrow('Access revoked')
})
