import { RequestContext, ProjectTypeProviderRegistry } from '@xpert-ai/plugin-sdk'
import { PluginApplicationInstallation } from '../plugin-resource/plugin-application-installation.entity'
import { XpertProjectTypeService } from './services/project-type.service'
import type { IUser, IXpert } from '@xpert-ai/contracts'
import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import { EntityManager, type DeepPartial, type Repository } from 'typeorm'
import type { ConnectorService } from '../connector/connector.service'
import type { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertProject } from './entities/project.entity'
import { Xpert } from '../xpert/xpert.entity'
import { XpertProjectService } from './project.service'
import type { XpertProjectAccessService } from './services/project-access.service'
import type { XpertProjectContentService } from './services/project-content.service'
import type { XpertProjectTaskService } from './services'
import { XpertProjectXpertBindingService } from './services/project-xpert-binding.service'

const expectation = {
    pluginName: '@xpert-ai/plugin-factory-operations',
    templateKey: 'factory-operations-equipment-diagnostics',
    agentKey: 'Agent_EquipmentDiagnostics'
}

describe('XpertProjectService managed provisioning', () => {
    beforeEach(() => {
        jest.restoreAllMocks()
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user-1', tenantId: 'tenant-1' } as IUser)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
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

        expect(result.assistantBindings).toEqual([])
        expect(result).not.toHaveProperty('externalAssistants')
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
        harness.content.initialize.mockRejectedValueOnce(new Error('content storage temporarily unavailable'))
        await expect(harness.service.ensureManagedProject(input)).rejects.toThrow(
            'content storage temporarily unavailable'
        )
        await expect(harness.service.ensureManagedProject(input)).resolves.toMatchObject({
            projectId: 'project-1',
            operation: 'updated',
            xpertIds: [requester.id]
        })
        expect(harness.repository.insert).toHaveBeenCalledTimes(1)
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

    it('keeps entity names owned by the application after conversation bootstrap', async () => {
        const requester = buildRequester([])
        const harness = buildHarness({ requester })
        const project = harness.createdProject
        project.name = 'Original tender'
        project.projectTypeSnapshot = {
            applicationTitle: 'Bid',
            title: 'Tender',
            binding: { kind: 'entity', providerKey: 'bid' }
        }
        project.settings = {
            conversationBootstrap: { conversationId: 'conversation', initialName: 'Bid project', nameResolved: true }
        }
        harness.repository.findOne.mockResolvedValue(project)
        await harness.service.ensureManagedProject({
            projectId: project.id,
            xpertId: requester.id,
            name: 'Renamed tender',
            status: 'active'
        })
        expect(project.name).toBe('Renamed tender')
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

        expect(result.assistantBindings).toEqual([{ ...expectation, xpertId: role.id }])
        expect(result.xpertIds).toEqual([requester.id, role.id])
        expect(harness.repository.insert).toHaveBeenCalledTimes(1)
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

        expect(harness.repository.insert).not.toHaveBeenCalled()
        expect(harness.repository.findOne).not.toHaveBeenCalled()
        expect(harness.repository.save).not.toHaveBeenCalled()
    })

    it('provisions every connected role and optional dependency without replaying the root token', async () => {
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
        expect(result.xpertIds).toEqual([requester.id, role.id, unrelated.id, child.id, optional.id])
        expect(harness.publishedXpertAccess.getAccessiblePublishedXpert.mock.calls.map(([id]) => id)).toEqual([
            requester.id
        ])
    })

    it.each(['cross_organization', 'cross_tenant', 'unpublished'] as const)(
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
                    errorCode: 'project_initial_assistant_unavailable'
                }
            })
            expect(harness.repository.save).not.toHaveBeenCalled()
            expect(harness.repository.insert).not.toHaveBeenCalled()
        }
    )

    it('seeds all assistants on ordinary API creation without later add-member calls', async () => {
        const child = buildRole('child')
        const root = buildRequester([child.id])
        root.graph.connections[0].required = false
        const harness = buildHarness({ requester: root, roles: [child] })
        const project = await harness.service.createProject({ name: 'Ordinary', xpertIds: [root.id, root.id] })
        expect(project.xperts.map((member) => member.id)).toEqual([root.id, child.id])
        expect(harness.repository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                xperts: [{ id: root.id }, { id: child.id }]
            })
        )
    })

    it('expands initial members when copying a Project', async () => {
        const child = buildRole('child')
        const root = buildRequester([child.id])
        const harness = buildHarness({ requester: root, roles: [child] })
        const source = Object.assign(new XpertProject(), {
            id: 'source',
            name: 'Source',
            xperts: [root],
            attachments: [],
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })
        jest.spyOn(harness.service, 'findOne').mockResolvedValue(source)
        Object.assign(harness.repository.manager, { getRepository: () => ({ find: async () => [] }) })
        const result = await harness.service.duplicate(source.id)
        expect(result.xperts.map((member) => member.id)).toEqual([root.id, child.id])
        expect(source.xperts).toEqual([root])
    })

    it('keeps manually removed members removed and supports explicit re-addition without expanding their graphs', async () => {
        const child = buildRole('child')
        const root = buildRequester([child.id])
        const harness = buildHarness({ requester: root, roles: [child] })
        const input = { projectId: 'project-1', xpertId: root.id, name: 'Case', status: 'active' as const }
        await harness.service.ensureManagedProject(input)
        jest.spyOn(harness.service, 'findOne').mockResolvedValue(harness.createdProject)
        Object.assign(harness.repository.manager, { getRepository: () => ({ update: jest.fn() }) })
        await harness.service.removeXpert(input.projectId, child.id)
        expect((await harness.service.ensureManagedProject(input)).xpertIds).toEqual([root.id])
        const expand = jest.spyOn(harness.bindingService, 'resolveInitialMembers')
        await harness.service.addXpert(input.projectId, child.id)
        expect(harness.createdProject.xperts.map((member) => member.id)).toEqual([root.id, child.id])
        expect(expand).not.toHaveBeenCalled()
    })

    it('initializes without expectations and never restores removed members or adds new graph dependencies', async () => {
        const child = buildRole('child')
        const later = buildRole('later')
        const root = buildRequester([child.id])
        root.graph.connections[0].required = false
        const harness = buildHarness({ requester: root, roles: [child, later] })
        const input = { projectId: 'project-1', xpertId: root.id, name: 'Case', status: 'active' as const }
        expect((await harness.service.ensureManagedProject(input)).xpertIds).toEqual([root.id, child.id])
        harness.createdProject.xperts = []
        root.graph.nodes.push({ type: 'xpert', key: later.id, entity: later, position: { x: 0, y: 0 } })
        root.graph.connections.push({ key: 'later-edge', type: 'xpert', from: root.agent.key, to: later.id })
        const expand = jest.spyOn(harness.bindingService, 'resolveInitialMembers')
        const result = await harness.service.ensureManagedProject(input)
        expect(result.xpertIds).toEqual([])
        expect(expand).not.toHaveBeenCalled()
        expect(harness.repository.save.mock.calls[0][0]).not.toHaveProperty('xperts')
        expect(harness.relation.add).toHaveBeenCalledTimes(1)
    })

    it('validates role expectations without restoring explicitly removed role members', async () => {
        const role = buildRole()
        const root = buildRequester([role.id])
        const harness = buildHarness({ requester: root, roles: [role] })
        const input = {
            projectId: 'project-1',
            xpertId: root.id,
            name: 'Case',
            status: 'active' as const,
            requesterAgentKey: root.agent.key,
            externalAssistantExpectations: [expectation]
        }
        await harness.service.ensureManagedProject(input)
        harness.createdProject.xperts = [root]
        const result = await harness.service.ensureManagedProject(input)
        expect(result.xpertIds).toEqual([root.id])
        expect(result.assistantBindings).toEqual([{ ...expectation, xpertId: role.id }])
        expect(harness.relation.add).toHaveBeenCalledTimes(1)
        expect(harness.repository.save.mock.calls[0][0]).not.toHaveProperty('xperts')
    })

    it('retains initialized members after published External edges are removed', async () => {
        const role = buildRole()
        const root = buildRequester([role.id])
        const harness = buildHarness({ requester: root, roles: [role] })
        const input = { projectId: 'project-1', xpertId: root.id, name: 'Case', status: 'active' as const }
        await harness.service.ensureManagedProject(input)
        root.graph.connections = []
        expect((await harness.service.ensureManagedProject(input)).xpertIds).toEqual([root.id, role.id])
        expect(harness.repository.save.mock.calls[0][0]).not.toHaveProperty('xperts')
    })

    it('does not restore a concurrently removed member from the metadata read snapshot', async () => {
        const child = buildRole('child')
        const root = buildRequester([child.id])
        const harness = buildHarness({ requester: root, roles: [child] })
        const input = { projectId: 'project-1', xpertId: root.id, name: 'Case', status: 'active' as const }
        await harness.service.ensureManagedProject(input)
        harness.repository.findOne.mockResolvedValue({ ...harness.createdProject, xperts: [root, child] })
        harness.createdProject.xperts = [root]
        await harness.service.ensureManagedProject(input)
        expect(harness.createdProject.xperts).toEqual([root])
        expect(harness.repository.save.mock.calls[0][0]).not.toHaveProperty('xperts')
    })

    it('persists identity and members in the same transaction before initializing content', async () => {
        const child = buildRole('child')
        const root = buildRequester([child.id])
        const harness = buildHarness({ requester: root, roles: [child] })
        await harness.service.ensureManagedProject({
            projectId: 'project-1',
            xpertId: root.id,
            name: 'Case',
            status: 'active'
        })
        expect(harness.transaction).toHaveBeenCalledTimes(1)
        expect(harness.relation.of).toHaveBeenCalledWith('project-1')
        expect(harness.relation.add).toHaveBeenCalledWith([root.id, child.id])
        expect(harness.relation.add.mock.invocationCallOrder[0]).toBeLessThan(
            harness.content.initialize.mock.invocationCallOrder[0]
        )
    })

    it('fails the creation transaction if linking initial members fails', async () => {
        const root = buildRequester([])
        const harness = buildHarness({ requester: root })
        harness.relation.add.mockRejectedValueOnce(new Error('membership write failed'))
        await expect(
            harness.service.ensureManagedProject({
                projectId: 'project-1',
                xpertId: root.id,
                name: 'Case',
                status: 'active'
            })
        ).rejects.toThrow('membership write failed')
        await expect(harness.transaction.mock.results[0].value).rejects.toThrow('membership write failed')
        expect(harness.content.initialize).not.toHaveBeenCalled()
    })

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
        latest: true,
        version: '4',
        publishAt: new Date('2026-09-01T00:00:00.000Z'),
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
        latest: true,
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
        create: jest.fn((entity: DeepPartial<XpertProject>) => Object.assign(createdProject, entity)),
        insert: jest.fn(async () => {
            repository.findOne.mockResolvedValue(createdProject)
        }),
        findOne: jest.fn<Promise<XpertProject | null>, []>().mockResolvedValue(null),
        save: jest.fn(async (project: DeepPartial<XpertProject>) => Object.assign(createdProject, project)),
        manager: new EntityManager(undefined)
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
    const xpertRepository = {
        findOne: jest.fn(async (options: { where: { id?: string; tenantId?: string; organizationId?: string } }) => {
            const candidate = xperts.get(options.where.id ?? '')
            return candidate?.tenantId === options.where.tenantId &&
                candidate?.organizationId === options.where.organizationId
                ? candidate
                : null
        })
    }
    const bindingService = new XpertProjectXpertBindingService(
        xpertRepository as unknown as Repository<Xpert>,
        repository as unknown as Repository<XpertProject>
    )
    const relation = {
        relation: jest.fn().mockReturnThis(),
        of: jest.fn().mockReturnThis(),
        add: jest.fn(async (ids: string[]) => {
            createdProject.xperts = ids.map((id) => xperts.get(id)!)
        })
    }
    const transaction = jest.fn(async (work: (manager: EntityManager) => Promise<void>) =>
        work(
            Object.assign(new EntityManager(undefined), {
                getRepository: () => repository,
                createQueryBuilder: () => relation
            })
        )
    )
    Object.assign(repository.manager, { transaction })
    const content = {
        initialize: jest.fn<Promise<void>, [XpertProject]>().mockResolvedValue(undefined),
        readInstructions: jest.fn().mockResolvedValue({ content: 'Instructions' })
    }
    const service = new XpertProjectService(
        repository as unknown as Repository<XpertProject>,
        {} as CommandBus,
        queryBus as unknown as QueryBus,
        {} as XpertProjectTaskService,
        {
            assertCanManage: async () => ({ project: createdProject, role: 'owner' })
        } as unknown as XpertProjectAccessService,
        content as unknown as XpertProjectContentService,
        publishedXpertAccess as unknown as PublishedXpertAccessService,
        {} as ConnectorService,
        bindingService as unknown as XpertProjectXpertBindingService,
        projectTypeTestService()
    )
    return { service, repository, createdProject, content, publishedXpertAccess, bindingService, transaction, relation }
}

function projectTypeTestService() {
    return new XpertProjectTypeService(
        {} as ProjectTypeProviderRegistry,
        {} as Repository<PluginApplicationInstallation>,
        {} as XpertProjectAccessService,
        {} as PublishedXpertAccessService
    )
}
