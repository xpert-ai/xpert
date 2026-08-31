import type { IXpert } from '@xpert-ai/contracts'
import type { XpertService } from '../../xpert.service'
import { FindXpertQuery } from '../get-one.query'
import { FindXpertHandler } from './get-one.handler'

describe('FindXpertHandler draft runtime', () => {
    it('preserves the persisted workspace policy when resolving a draft team', async () => {
        const xpert = {
            id: 'xpert-1',
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            workspaceId: 'workspace-1',
            workspaceDataScope: 'user',
            graph: { nodes: [], connections: [] },
            agent: { key: 'published-agent' },
            draft: {
                team: {
                    workspaceId: 'draft-workspace',
                    workspaceDataScope: 'shared',
                    agent: { key: 'draft-agent' }
                },
                nodes: [
                    {
                        key: 'draft-agent',
                        type: 'agent',
                        entity: { key: 'draft-agent' }
                    }
                ],
                connections: []
            }
        } as unknown as IXpert
        const service = {
            findOne: jest.fn().mockResolvedValue(xpert)
        } as Partial<XpertService> as XpertService
        const handler = new FindXpertHandler(service)

        const result = await handler.execute(new FindXpertQuery({ id: 'xpert-1' }, { isDraft: true }))

        expect(result).toEqual(
            expect.objectContaining({
                id: 'xpert-1',
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                workspaceId: 'draft-workspace',
                workspaceDataScope: 'user',
                agent: expect.objectContaining({ key: 'draft-agent' }),
                graph: {
                    nodes: xpert.draft.nodes,
                    connections: xpert.draft.connections
                }
            })
        )
    })
})
