jest.mock('../xpert.entity', () => ({ Xpert: class Xpert {} }))

import { ForbiddenException } from '@nestjs/common'
import { WorkflowNodeTypeEnum, XpertTypeEnum, type TXpertGraph, type IWFNMiddleware } from '@xpert-ai/contracts'
import { AssistantMiddlewareAccessService } from './assistant-middleware-access.service'
import { Xpert } from '../xpert.entity'
import { Test } from '@nestjs/testing'
import { AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'
import { getRepositoryToken } from '@nestjs/typeorm'
import { UserOrganization } from '@xpert-ai/server-core'
import { ProjectAccessRuntimeService } from '../../xpert-project/services/project-access-runtime.service'
import { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'
import { XpertProjectXpertBindingService } from '../../xpert-project/services/project-xpert-binding.service'
import { PublishedXpertAccessService } from '../published-xpert-access.service'
import { inspectAssistantMiddlewares } from './assistant-middleware'

const actor = { tenantId: 'tenant', organizationId: 'organization', userId: 'human' }
function setup() {
    const middleware: IWFNMiddleware = { id: 'capability', type: WorkflowNodeTypeEnum.MIDDLEWARE, key: 'capability', provider: 'pluginCapability' }
    const graph: TXpertGraph = {
        nodes: [{ type: 'workflow', key: 'capability', position: { x: 0, y: 0 }, entity: middleware }],
        connections: [{ type: 'workflow', key: 'agent/capability', from: 'agent', to: 'capability' }]
    }
    const xpert: Xpert = Object.assign(new Xpert(), {
        id: 'assistant', tenantId: actor.tenantId, latest: true, title: 'Assistant', type: XpertTypeEnum.Agent, organizationId: actor.organizationId,
        agent: { key: 'agent' }, graph, workspaceDataScope: 'shared' as const
    })
    const published = { getAccessiblePublishedXpertForActor: jest.fn().mockResolvedValue(xpert) }
    const middlewares = { get: jest.fn().mockReturnValue({ meta: { features: ['collaboration'] } }) }
    const projects = { assertAssistant: jest.fn().mockResolvedValue({ projectId: 'project' }) }
    const query = {
        leftJoinAndSelect: jest.fn().mockReturnThis(), innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue(xpert)
    }
    const assistants = { createQueryBuilder: jest.fn().mockReturnValue(query) }
    const service = new AssistantMiddlewareAccessService(published, middlewares, projects, assistants)
    return { service, xpert, published, middlewares, projects, query, assistants }
}
const input = { scope: { type: 'assistant' as const }, actor, assistantId: 'assistant', provider: 'pluginCapability', requiredFeature: 'collaboration' }
describe('Assistant middleware access', () => {
    it('inherits live human permission without conflating feature access with file isolation', async () => {
        const { service, xpert, published } = setup()
        await expect(service.assertAccess(input)).resolves.toBeUndefined()
        xpert.workspaceDataScope = 'user'
        await expect(service.assertAccess(input)).resolves.toBeUndefined()
        expect(published.getAccessiblePublishedXpertForActor).toHaveBeenCalledWith('assistant', actor)
    })
    it('does not reuse a cached grant after revocation', async () => {
        const { service, published } = setup()
        await service.assertAccess(input)
        published.getAccessiblePublishedXpertForActor.mockRejectedValue(new ForbiddenException())
        await expect(service.assertAccess(input)).rejects.toThrow(ForbiddenException)
    })
    it('rejects removed and unconnected capability nodes, regardless of a feature flag', async () => {
        const { service, xpert } = setup()
        xpert.graph.connections = []
        await expect(service.assertAccess(input)).rejects.toThrow(ForbiddenException)
    })
    it('fails closed when the plugin is no longer registered', async () => {
        const { service, middlewares } = setup()
        middlewares.get.mockImplementation(() => { throw new Error('missing plugin') })
        await expect(service.assertAccess(input)).rejects.toThrow(ForbiddenException)
    })

    it('resolves explicit authorization dependencies in the Nest container', async () => {
        const { published, middlewares, projects, assistants } = setup()
        const module = await Test.createTestingModule({ providers: [
            AssistantMiddlewareAccessService,
            { provide: PublishedXpertAccessService, useValue: published },
            { provide: AgentMiddlewareRegistry, useValue: middlewares },
            { provide: ProjectAccessRuntimeService, useValue: projects },
            { provide: getRepositoryToken(Xpert), useValue: assistants }
        ] }).compile()
        await expect(module.get(AssistantMiddlewareAccessService).assertAccess(input)).resolves.toBeUndefined()
        await module.close()
    })

    it('does not accept an unrelated provider advertising the same feature', async () => {
        const { service } = setup()
        await expect(service.assertAccess({ ...input, provider: 'unrelated' })).rejects.toThrow(ForbiddenException)
    })

    it('rejects duplicate provider connections instead of choosing a configuration', async () => {
        const { service, xpert } = setup()
        const first = xpert.graph.nodes[0]
        xpert.graph.nodes.push({ ...first, key: 'duplicate' })
        xpert.graph.connections.push({ type: 'workflow', key: 'agent/duplicate', from: 'agent', to: 'duplicate' })
        await expect(service.assertAccess(input)).rejects.toThrow(ForbiddenException)
    })

    it('rechecks plugin availability and shares the feature interpretation with View discovery', async () => {
        const { service, xpert, middlewares } = setup()
        expect(inspectAssistantMiddlewares(xpert, middlewares).middlewares[0].features).toEqual(['collaboration'])
        await service.assertAccess(input)
        middlewares.get.mockImplementation(() => { throw new Error('uninstalled') })
        expect(inspectAssistantMiddlewares(xpert, middlewares).middlewares[0].features).toEqual([])
        await expect(service.assertAccess(input)).rejects.toThrow(ForbiddenException)
    })

    it('resolves a graph primary Agent consistently when the relation is absent', async () => {
        const { service, xpert } = setup()
        xpert.graph.nodes.unshift({ type: 'agent', key: 'agent', position: { x: 0, y: 0 }, entity: xpert.agent })
        xpert.agent = null
        await expect(service.assertAccess(input)).resolves.toBeUndefined()
    })

    it.each([{ provider: '' }, { requiredFeature: '' }, { requiredFeature: 'not-installed' }])(
        'rejects an invalid or unavailable requirement %j', async (requirement) => {
            const { service } = setup()
            await expect(service.assertAccess({ ...input, ...requirement })).rejects.toThrow(ForbiddenException)
        }
    )
})

const projectInput = { ...input, scope: { type: 'project' as const, projectId: 'project' } }
describe('Project-scoped Assistant middleware access', () => {
    it('uses Project authority without requiring standalone catalog visibility', async () => {
        const f = setup()
        f.published.getAccessiblePublishedXpertForActor.mockRejectedValue(new ForbiddenException())
        await expect(f.service.assertAccess(projectInput)).resolves.toBeUndefined()
        expect(f.published.getAccessiblePublishedXpertForActor).not.toHaveBeenCalled()
        expect(f.projects.assertAssistant).toHaveBeenCalledWith({ actor, assistantId: 'assistant', projectId: 'project' })
        await expect(f.service.assertAccess(input)).rejects.toThrow(ForbiddenException)
    })
    it('loads only the exact published Assistant for the explicit active organization member', async () => {
        const { service, query } = setup()
        await service.assertAccess(projectInput)
        expect(query.innerJoin).toHaveBeenCalledWith(UserOrganization, 'actorMembership',
            expect.stringContaining('actorMembership.tenantId = :tenantId AND actorMembership.organizationId = :organizationId AND actorMembership.userId = :userId AND actorMembership.isActive = :actorMembershipActive'),
            { userId: actor.userId, actorMembershipActive: true })
        expect(query.where).toHaveBeenCalledWith('xpert.id = :assistantId', { assistantId: input.assistantId })
        expect(query.andWhere).toHaveBeenCalledWith('xpert.tenantId = :tenantId', { tenantId: actor.tenantId })
        expect(query.andWhere).toHaveBeenCalledWith('xpert.organizationId = :organizationId', { organizationId: actor.organizationId })
        expect(query.andWhere).toHaveBeenCalledWith('xpert.publishAt IS NOT NULL')
    })
    it('does not fall back to standalone access after Project denial', async () => {
        const f = setup()
        await f.service.assertAccess(projectInput)
        f.projects.assertAssistant.mockRejectedValue(new ForbiddenException())
        f.query.getOne.mockClear()
        await expect(f.service.assertAccess(projectInput)).rejects.toThrow(ForbiddenException)
        expect(f.query.getOne).not.toHaveBeenCalled()
        expect(f.published.getAccessiblePublishedXpertForActor).not.toHaveBeenCalled()
    })
    it('denies missing publication or active organization membership even with a Project grant', async () => {
        const { service, query } = setup()
        await service.assertAccess(projectInput)
        query.getOne.mockResolvedValue(null)
        await expect(service.assertAccess(projectInput)).rejects.toThrow(ForbiddenException)
    })
    it('rechecks the connected feature even for Project members', async () => {
        const { service, xpert } = setup()
        await service.assertAccess(projectInput)
        xpert.graph.connections = []
        await expect(service.assertAccess(projectInput)).rejects.toThrow(ForbiddenException)
    })
    it.each(['tenantId', 'organizationId', 'userId'])('requires explicit %s', async (key) => {
        const f = setup()
        await expect(f.service.assertAccess({ ...projectInput, actor: { ...actor, [key]: '' } })).rejects.toThrow(ForbiddenException)
        expect(f.projects.assertAssistant).not.toHaveBeenCalled()
    })

    it('integrates real Project membership and Assistant binding policies for a catalog-denied member', async () => {
        const f = setup()
        let member = true
        const project = { id: 'project', tenantId: actor.tenantId, organizationId: actor.organizationId,
            ownerId: 'another-user', status: 'active', xperts: [f.xpert] }
        const projectRepository = { findOne: jest.fn(async ({ where }) =>
            where.id === project.id && where.tenantId === project.tenantId && where.organizationId === project.organizationId ? project : null) }
        const membershipRepository = { findOne: jest.fn(async ({ where }) => member && where.userId === actor.userId ? { role: 'member' } : null) }
        const binding = new XpertProjectXpertBindingService({ findOne: jest.fn(async ({ where }) =>
            where.id === f.xpert.id && where.tenantId === f.xpert.tenantId && where.organizationId === f.xpert.organizationId ? f.xpert : null) } as never, projectRepository as never)
        const policy = new XpertProjectAccessService(projectRepository as never, membershipRepository as never, binding)
        const projects = new ProjectAccessRuntimeService(projectRepository as never, policy)
        jest.spyOn(projects, 'listReadable').mockImplementation(async () => member ? [{ projectId: 'project', role: 'member', archived: false, canManage: false }] : [])
        const service = new AssistantMiddlewareAccessService(f.published, f.middlewares, projects, f.assistants)
        f.published.getAccessiblePublishedXpertForActor.mockRejectedValue(new ForbiddenException())
        await expect(service.assertAccess(projectInput)).resolves.toBeUndefined()
        await expect(service.assertAccess(input)).rejects.toThrow(ForbiddenException)
        for (const denied of [
            { ...projectInput, scope: { type: 'project' as const, projectId: 'another-project' } },
            { ...projectInput, assistantId: 'unbound-assistant' },
            { ...projectInput, actor: { ...actor, tenantId: 'another-tenant' } },
            { ...projectInput, actor: { ...actor, organizationId: 'another-organization' } },
            { ...projectInput, actor: { ...actor, userId: 'another-recipient' } }
        ]) await expect(service.assertAccess(denied)).rejects.toThrow(ForbiddenException)
        project.xperts = []
        await expect(service.assertAccess(projectInput)).rejects.toThrow(ForbiddenException)
        project.xperts = [f.xpert]
        member = false
        await expect(service.assertAccess(projectInput)).rejects.toThrow(ForbiddenException)
    })
})
