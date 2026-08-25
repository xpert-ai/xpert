import { McpPublicationCapability } from './entities'
import { McpSubscriptionService } from './mcp-subscription.service'

describe('McpSubscriptionService', () => {
    it('isolates listeners by publication and maps capability events', async () => {
        const service = new McpSubscriptionService()
        const first: object[] = []
        const second: object[] = []
        service.bus('publication-a').subscribe((event) => first.push(event))
        service.bus('publication-b').subscribe((event) => second.push(event))

        await service.eventsApi('publication-a').emit({ type: 'tools.changed' })
        await service.eventsApi('publication-a').emit({ type: 'resource.updated', key: 'xpert://document/1' })

        expect(first).toEqual([{ kind: 'tools_list_changed' }, { kind: 'resource_updated', uri: 'xpert://document/1' }])
        expect(second).toEqual([])
    })

    it('does not publish resource updates outside the publication catalog', async () => {
        const service = new McpSubscriptionService()
        const events: object[] = []
        service.bus('publication-a').subscribe((event) => events.push(event))
        const resource = Object.assign(new McpPublicationCapability(), {
            descriptorSnapshot: {
                descriptorVersion: 1,
                capabilityType: 'resource',
                capabilityKey: 'document',
                source: { toolsetId: 'toolset' },
                requiredContext: ['workspace'],
                visibility: ['model'],
                uri: 'xpert://document/allowed'
            }
        })

        const api = service.eventsApi('publication-a', [resource])
        await api.emit({ type: 'resource.updated', key: 'xpert://document/denied' })
        await api.emit({ type: 'resource.updated', key: 'xpert://document/allowed' })

        expect(events).toEqual([{ kind: 'resource_updated', uri: 'xpert://document/allowed' }])
    })

    it('does not emit list changes for capability types absent from the publication', async () => {
        const service = new McpSubscriptionService()
        const events: object[] = []
        const resource = resourceCapability('publication-a', 'xpert://document/allowed')
        service.bus('publication-a').subscribe((event) => events.push(event))

        const api = service.eventsApi('publication-a', [resource])
        await api.emit({ type: 'tools.changed' })
        await api.emit({ type: 'prompts.changed' })
        await api.emit({ type: 'resources.changed' })

        expect(events).toEqual([{ kind: 'resources_list_changed' }])
    })

    it('rejects dangerous schemes and encoded traversal before publishing updates', async () => {
        const service = new McpSubscriptionService()
        const events: object[] = []
        service.bus('publication-a').subscribe((event) => events.push(event))

        await service.eventsApi('publication-a').emit({ type: 'resource.updated', key: 'file:///etc/passwd' })
        await service
            .eventsApi('publication-a')
            .emit({ type: 'resource.updated', key: 'xpert://document/%2e%2e/secret' })

        expect(events).toEqual([])
    })

    it('delivers task updates only to task listeners in the matching publication', async () => {
        const service = new McpSubscriptionService()
        const taskIds: string[] = []
        const coreEvents: object[] = []
        service.subscribeTasks('publication-a', (taskId) => taskIds.push(taskId))
        service.bus('publication-a').subscribe((event) => coreEvents.push(event))

        service.publishTaskUpdated('publication-a', 'task-1')
        service.publishTaskUpdated('publication-b', 'task-2')
        await service.eventsApi('publication-a').emit({ type: 'task.updated', taskId: 'task-3' })

        expect(taskIds).toEqual(['task-1', 'task-3'])
        expect(coreEvents).toEqual([])
    })

    it('delivers access invalidation only to connections in the matching publication', () => {
        const service = new McpSubscriptionService()
        const first = jest.fn()
        const second = jest.fn()
        service.subscribeAccessInvalidations('publication-a', first)
        service.subscribeAccessInvalidations('publication-b', second)

        service.publishAccessInvalidated('publication-a')

        expect(first).toHaveBeenCalledTimes(1)
        expect(second).not.toHaveBeenCalled()
    })

    it('fans generic toolset events out to every active publication binding', async () => {
        const firstResource = resourceCapability('publication-a', 'xpert://document/1')
        const secondResource = resourceCapability('publication-b', 'xpert://document/1')
        const find = jest.fn().mockResolvedValue([firstResource, secondResource])
        const service = new McpSubscriptionService(undefined, { find })
        const first: object[] = []
        const second: object[] = []
        service.bus('publication-a').subscribe((event) => first.push(event))
        service.bus('publication-b').subscribe((event) => second.push(event))

        await service.eventsApiForToolset('toolset-1').emit({
            type: 'resource.updated',
            key: 'xpert://document/1'
        })

        expect(find).toHaveBeenCalledWith({
            where: { toolsetId: 'toolset-1', enabled: true, publication: { status: 'active' } },
            relations: ['publication']
        })
        expect(first).toEqual([{ kind: 'resource_updated', uri: 'xpert://document/1' }])
        expect(second).toEqual([{ kind: 'resource_updated', uri: 'xpert://document/1' }])
    })
})

function resourceCapability(publicationId: string, uri: string) {
    return Object.assign(new McpPublicationCapability(), {
        publicationId,
        toolsetId: 'toolset-1',
        enabled: true,
        descriptorSnapshot: {
            descriptorVersion: 1,
            capabilityType: 'resource',
            capabilityKey: 'document',
            source: { toolsetId: 'toolset-1' },
            requiredContext: ['workspace'],
            visibility: ['model'],
            uri
        }
    })
}
