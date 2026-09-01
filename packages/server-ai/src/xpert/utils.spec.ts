jest.mock('../shared', () => ({
    isKeyEqual: (left?: string | null, right?: string | null) => Boolean(left && right && left === right)
}))

import type { IXpert } from '@xpert-ai/contracts'
import { getXpertAgent } from './utils'

describe('getXpertAgent draft runtime', () => {
    it('keeps the root workspace policy authoritative over draft team data', () => {
        const agent = { key: 'agent-1', name: 'Agent' }
        const xpert = {
            id: 'xpert-1',
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            workspaceId: 'workspace-1',
            workspaceDataScope: 'user',
            agent,
            agents: [],
            executors: [],
            graph: { nodes: [], connections: [] },
            draft: {
                team: {
                    agent,
                    workspaceDataScope: 'shared'
                },
                nodes: [
                    {
                        key: 'agent-1',
                        type: 'agent',
                        entity: agent
                    }
                ],
                connections: []
            }
        } as unknown as IXpert

        const result = getXpertAgent(xpert, 'agent-1', { isDraft: true })

        expect(result?.team).toEqual(
            expect.objectContaining({
                workspaceId: 'workspace-1',
                workspaceDataScope: 'user'
            })
        )
    })
})
