import { RequestContext, ProjectTypeProviderRegistry } from '@xpert-ai/plugin-sdk'
import { PluginApplicationInstallation } from '../plugin-resource/plugin-application-installation.entity'
import { XpertProjectTypeService } from './services/project-type.service'
import type { IUser, IXpert } from '@xpert-ai/contracts'
import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import type { Repository } from 'typeorm'
import type { ConnectorService } from '../connector/connector.service'
import type { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import type { XpertProject } from './entities/project.entity'
import { XpertProjectService } from './project.service'
import type { XpertProjectAccessService } from './services/project-access.service'
import type { XpertProjectContentService } from './services/project-content.service'
import type { XpertProjectTaskService } from './services'
import type { XpertProjectXpertBindingService } from './services/project-xpert-binding.service'

const expectation = {
    pluginName: '@xpert-ai/plugin-factory-operations',
    templateKey: 'factory-operations-equipment-diagnostics',
    agentKey: 'Agent_EquipmentDiagnostics'
}

describe('XpertProjectService managed provisioning', () => {
    beforeEach(() => {
        jest.restoreAllMocks()
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user-1', tenantId: 'tenant-1' } as IUser)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
    })

    it('preserves the existing single-Assistant ensure contract when expectations are omitted', async () => {
        const requester = buildRequester([])
        const harness = buildHarness({ requester })

        const result = await harness.service.ensureManagedProject({
            projectId: 'project-1',
            xpertId: requester.id,
            name: 'FAC-001 · Vibration anomaly',
            status: 'active'
        })

        expect(result.xpertIds).toEqual([requester.id])
        expect(harness.createdProject.xperts).toEqual([requester])
    })

    it('repairs content after a persisted Project survives a failed creation attempt', async () => {
        const requester = buildRequester([])
        const harness = buildHarness({ requester })
        const input = {
            projectId: 'project-1',
            xpertId: requester.id,
            name: 'Automotive Case',
            status: 'active' as const
        }
        jest.mocked(harness.service.create).mockImplementationOnce(async () => {
            harness.repository.findOne.mockResolvedValue(harness.createdProject)
            throw new Error('content storage temporarily unavailable')
        })
        await expect(harness.service.ensureManagedProject(input)).rejects.toThrow(
            'content storage temporarily unavailable'
        )
        await expect(harness.service.ensureManagedProject(input)).resolves.toMatchObject({
            projectId: 'project-1',
            operation: 'updated',
            xpertIds: [requester.id]
        })
        expect(harness.service.create).toHaveBeenCalledTimes(1)
        expect(harness.content.initialize).toHaveBeenCalledWith(harness.createdProject)
    })

    it('replaces a provisional conversation name once and preserves subsequent user naming', async () => {
        const requester = buildRequester([])
        const harness = buildHarness({ requester })
        const project = harness.createdProject
        project.name = 'Bid project'
        project.settings = { conversationBootstrap: { conversationId: 'conversation', initialName: project.name } }
        harness.repository.findOne.mockResolvedValue(project)
        const input = {
            projectId: project.id,
            xpertId: requester.id,
            name: 'Tender project',
            status: 'active' as const
        }
        await harness.service.ensureManagedProject(input)
        expect(project.name).toBe('Tender project')
        project.name = 'User name'
        await harness.service.ensureManagedProject(input)
        expect(project.name).toBe('User name')
    })

    it('preserves a name edited before the business app first provisions the conversation Project', async () => {
        const requester = buildRequester([])
        const harness = buildHarness({ requester })
        const project = harness.createdProject
        project.name = 'User name'
        project.settings = { conversationBootstrap: { conversationId: 'conversation', initialName: 'Bid project' } }
        harness.repository.findOne.mockResolvedValue(project)
        await harness.service.ensureManagedProject({
            projectId: project.id,
            xpertId: requester.id,
            name: 'Tender',
            status: 'active'
        })
        expect(project.name).toBe('User name')
    })

    it('connects the requester and every validated direct required External Assistant in one save', async () => {
        const role = buildRole()
        const requester = buildRequester([role.id])
        const harness = buildHarness({ requester, roles: [role] })

        const result = await harness.service.ensureManagedProject({
            projectId: 'project-1',
            xpertId: requester.id,
            requesterAgentKey: 'Agent_FactoryOrchestrator',
            externalAssistantExpectations: [expectation, expectation],
            name: 'FAC-001 · Vibration anomaly',
            status: 'active'
        })

        expect(result.xpertIds).toEqual([requester.id, role.id])
        expect(harness.repository.save).toHaveBeenCalledTimes(1)
        expect(harness.createdProject.xperts).toEqual([requester, role])
    })

    it('performs complete validation before creating a Project', async () => {
        const requester = buildRequester([])
        const harness = buildHarness({ requester })

        await expect(
            harness.service.ensureManagedProject({
                projectId: 'project-1',
                xpertId: requester.id,
                requesterAgentKey: 'Agent_FactoryOrchestrator',
                externalAssistantExpectations: [expectation],
                name: 'FAC-001 · Vibration anomaly',
                status: 'active'
            })
        ).rejects.toMatchObject({
            response: { errorCode: 'project_assistant_binding_missing' }
        })

        expect(harness.service.create).not.toHaveBeenCalled()
        expect(harness.repository.findOne).not.toHaveBeenCalled()
        expect(harness.repository.save).not.toHaveBeenCalled()
    })

    it('provisions selected role dependencies without replaying the root token against a nested Assistant', async () => {
        const role = buildRole(),
            child = buildRole('figure'),
            optional = buildRole('optional'),
            unrelated = buildRole('unrelated')
        role.graph = {
            nodes: [child, optional].map((candidate) => ({
                type: 'xpert',
                key: candidate.id,
                entity: candidate,
                position: { x: 0, y: 0 }
            })),
            connections: [child, optional].map((candidate) => ({
                key: `${role.id}/${candidate.id}`,
                type: 'xpert',
                from: role.agent.key,
                to: candidate.id,
                required: candidate.id === child.id
            }))
        }
        const requester = buildRequester([role.id, unrelated.id])
        unrelated.options = {
            templateSource: {
                templateId: 'another-role',
                pluginName: expectation.pluginName,
                templateKey: 'another-role'
            }
        }
        const harness = buildHarness({ requester, roles: [role, child, optional, unrelated] })
        const result = await harness.service.ensureManagedProject({
            projectId: 'project-1',
            xpertId: requester.id,
            requesterAgentKey: requester.agent.key,
            externalAssistantExpectations: [expectation],
            name: 'Nested case',
            status: 'active'
        })
        expect(result.xpertIds).toEqual([requester.id, role.id, child.id])
        expect(harness.publishedXpertAccess.getAccessiblePublishedXpert.mock.calls.map(([id]) => id)).toEqual([
            requester.id
        ])
    })

    it.each(['cross_organization', 'cross_tenant', 'unpublished', 'cycle'] as const)(
        'rejects a %s dependency before Project writes',
        async (invalid) => {
            const role = buildRole(),
                child = buildRole('figure')
            role.graph = {
                nodes: [{ type: 'xpert', key: child.id, entity: child, position: { x: 0, y: 0 } }],
                connections: [{ key: 'role/child', type: 'xpert', from: role.agent.key, to: child.id, required: true }]
            }
            if (invalid === 'cross_organization') child.organizationId = 'another-org'
            if (invalid === 'cross_tenant') child.tenantId = 'another-tenant'
            if (invalid === 'unpublished') child.active = false
            if (invalid === 'cycle')
                child.graph = {
                    nodes: [{ type: 'xpert', key: role.id, entity: role, position: { x: 0, y: 0 } }],
                    connections: [
                        { key: 'child/role', type: 'xpert', from: child.agent.key, to: role.id, required: true }
                    ]
                }
            const requester = buildRequester([role.id]),
                harness = buildHarness({ requester, roles: [role, child] })
            await expect(
                harness.service.ensureManagedProject({
                    projectId: 'project-1',
                    xpertId: requester.id,
                    requesterAgentKey: requester.agent.key,
                    externalAssistantExpectations: [expectation],
                    name: 'Nested case',
                    status: 'active'
                })
            ).rejects.toMatchObject({
                response: {
                    errorCode: `project_assistant_binding_${invalid === 'cycle' ? 'incompatible' : invalid === 'cross_tenant' ? 'cross_organization' : invalid}`
                }
            })
            expect(harness.repository.save).not.toHaveBeenCalled()
            expect(harness.service.create).not.toHaveBeenCalled()
        }
    )

    it('rejects an expectation that resolves to more than one direct Assistant', async () => {
        const roles = [buildRole('role-1'), buildRole('role-2')]
        const requester = buildRequester(roles.map((role) => role.id))
        const harness = buildHarness({ requester, roles })

        await expect(
            harness.service.ensureManagedProject({
                projectId: 'project-1',
                xpertId: requester.id,
                requesterAgentKey: 'Agent_FactoryOrchestrator',
                externalAssistantExpectations: [expectation],
                name: 'FAC-001 · Vibration anomaly',
                status: 'active'
            })
        ).rejects.toMatchObject({
            response: { errorCode: 'project_assistant_binding_ambiguous' }
        })
        expect(harness.repository.findOne).not.toHaveBeenCalled()
    })
})

function buildRequester(roleIds: string[]): IXpert {
    return {
        id: 'orchestrator-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        name: 'factory-orchestrator',
        active: true,
        version: '4',
        agent: { key: 'Agent_FactoryOrchestrator' },
        graph: {
            nodes: [
                { type: 'agent', key: 'Agent_FactoryOrchestrator' },
                ...roleIds.map((key) => ({ type: 'xpert' as const, key }))
            ],
            connections: roleIds.map((to) => ({
                type: 'xpert' as const,
                from: 'Agent_FactoryOrchestrator',
                to,
                required: true
            }))
        }
    } as IXpert
}

function buildRole(id = 'role-1'): IXpert {
    return {
        id,
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        name: `equipment-diagnostics-${id}`,
        active: true,
        publishAt: new Date('2026-09-01T00:00:00.000Z'),
        version: '2',
        agent: { key: expectation.agentKey },
        graph: { nodes: [], connections: [] },
        options: {
            templateSource: {
                templateId: `${expectation.pluginName}:${expectation.templateKey}`,
                templateKey: expectation.templateKey,
                pluginName: expectation.pluginName
            }
        }
    } as IXpert
}

function buildHarness(input: { requester: IXpert; roles?: IXpert[] }) {
    const createdProject = {
        id: 'project-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        ownerId: 'user-1',
        xperts: []
    } as unknown as XpertProject
    const repository = {
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn(async (project: XpertProject) => project)
    }
    const xperts = new Map([input.requester, ...(input.roles ?? [])].map((xpert) => [xpert.id, xpert]))
    const publishedXpertAccess = {
        getAccessiblePublishedXpert: jest.fn(
            async (id: string) => xperts.get(id) ?? Promise.reject(new Error('missing'))
        )
    }
    const queryBus = {
        execute: jest.fn(async (query: { conditions?: { id?: string } }) => {
            const candidate = query.conditions?.id ? xperts.get(query.conditions.id) : undefined
            if (!candidate) throw new Error('missing')
            return candidate
        })
    }
    const bindingService = {
        resolveCurrent: jest.fn(async (xpert: IXpert) => xpert),
        normalize: jest.fn(async (project: XpertProject) => project),
        contains: jest.fn(
            (project: XpertProject, xpert: IXpert) => project.xperts?.some((item) => item.id === xpert.id) ?? false
        ),
        isSameXpert: jest.fn((left: IXpert, right: IXpert) => left.id === right.id)
    }
    const content = Object.assign({} as XpertProjectContentService, { initialize: jest.fn() })
    const service = new XpertProjectService(
        repository as unknown as Repository<XpertProject>,
        {} as CommandBus,
        queryBus as unknown as QueryBus,
        {} as XpertProjectTaskService,
        {} as XpertProjectAccessService,
        content,
        publishedXpertAccess as unknown as PublishedXpertAccessService,
        {} as ConnectorService,
        bindingService as unknown as XpertProjectXpertBindingService,
        projectTypeTestService()
    )
    jest.spyOn(service, 'create').mockResolvedValue(createdProject)
    return { service, repository, createdProject, content, publishedXpertAccess }
}

function projectTypeTestService() {
    return new XpertProjectTypeService(
        {} as ProjectTypeProviderRegistry,
        {} as Repository<PluginApplicationInstallation>,
        {} as XpertProjectAccessService,
        {} as PublishedXpertAccessService
    )
}
