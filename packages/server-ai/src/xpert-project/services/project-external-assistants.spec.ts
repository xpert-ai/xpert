import { ForbiddenException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { XpertTypeEnum, type IXpert } from '@xpert-ai/contracts'
import type { ProjectEnsureInput } from '@xpert-ai/plugin-sdk'
import { GetAccessiblePublishedXpertQuery } from '../../xpert/published-agent/get-accessible-published-xpert.query'
import { validateProjectExternalAssistants } from './project-external-assistants'

describe('Project external Assistant authorization', () => {
    const expectation = { pluginName: '@test/app', templateKey: 'writer', agentKey: 'writer' }
    function fixture() {
        const target: IXpert = {
            id: 'child',
            name: 'Writer', slug: 'writer', type: XpertTypeEnum.Agent,
            tenantId: 'tenant',
            organizationId: 'org',
            publishAt: new Date(),
            agent: { key: 'writer' },
            graph: { nodes: [], connections: [] },
            options: {
                templateSource: { templateId: '@test/app:writer', pluginName: '@test/app', templateKey: 'writer' }
            }
        }
        const requester: IXpert = {
            id: 'parent',
            name: 'Primary', slug: 'primary', type: XpertTypeEnum.Agent,
            tenantId: 'tenant',
            organizationId: 'org',
            agent: { key: 'primary' },
            graph: {
                nodes: [{ type: 'xpert', key: target.id, entity: target, position: { x: 0, y: 0 } }],
                connections: [{ key: 'writer-edge', type: 'xpert', from: 'primary', to: target.id, required: true }]
            }
        }
        const input: ProjectEnsureInput = {
            projectId: 'project',
            xpertId: requester.id,
            name: 'Project',
            status: 'active',
            requesterAgentKey: 'primary',
            externalAssistantExpectations: [expectation]
        }
        const queries = new QueryBus(null)
        const execute = jest.spyOn(queries, 'execute').mockResolvedValue(target)
        return { target, requester, input, queries, execute }
    }

    it('resolves the declared role through the parent-scoped published resource query', async () => {
        const f = fixture()
        await expect(validateProjectExternalAssistants(f.queries, f.requester, f.input)).resolves.toEqual([
            { ...expectation, xpertId: 'child' }
        ])
        expect(f.execute).toHaveBeenCalledTimes(1)
        expect(f.execute).toHaveBeenCalledWith(new GetAccessiblePublishedXpertQuery('child', ['agent'], 'parent'))
    })

    it('does not expose a denied resource or bypass the published access query', async () => {
        const f = fixture()
        f.execute.mockRejectedValue(new ForbiddenException())
        await expect(validateProjectExternalAssistants(f.queries, f.requester, f.input)).rejects.toMatchObject({
            response: { errorCode: 'project_assistant_binding_missing' }
        })
        expect(f.execute).toHaveBeenCalledTimes(1)
    })

    it('does not look up undeclared Assistant IDs', async () => {
        const f = fixture()
        f.requester.graph.connections = []
        await expect(validateProjectExternalAssistants(f.queries, f.requester, f.input)).rejects.toMatchObject({
            response: { errorCode: 'project_assistant_binding_missing' }
        })
        expect(f.execute).not.toHaveBeenCalled()
    })
})
