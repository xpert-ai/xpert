import { createRuntimeSkillCapabilityId, WorkflowNodeTypeEnum, XpertTypeEnum } from '@xpert-ai/contracts'

jest.mock('../assistant-binding', () => ({
    AssistantBindingService: class {}
}))
jest.mock('../skill-package', () => ({
    SkillPackageService: class {}
}))
jest.mock('../prompt-workflow', () => ({
    PromptWorkflowService: class {}
}))

import { RuntimeCapabilitiesService } from './runtime-capabilities.service'
import { RuntimeCommandService } from './runtime-command.service'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { XpertProjectContentService } from '../xpert-project/services/project-content.service'

describe('RuntimeCapabilitiesService', () => {
    it('omits plugin-relative skill image icons so ChatKit can use its default skill icon', async () => {
        const service = new RuntimeCapabilitiesService(
            { get: jest.fn() } as any,
            {
                getAllByWorkspaceForRuntime: jest.fn(async () => ({
                    items: [
                        {
                            id: 'documents-skill',
                            workspaceId: 'workspace-1',
                            name: 'documents',
                            metadata: {
                                icon: {
                                    type: 'image',
                                    value: './assets/icon.png'
                                },
                                color: '#2563EB'
                            },
                            skillIndex: {
                                name: 'documents'
                            }
                        }
                    ]
                }))
            } as any,
            new RuntimeCommandService(),
            {
                resolveRuntimeCommandProfile: jest.fn(async () => ({
                    hasProfile: false,
                    xpertCommands: [],
                    workspaceCommands: [],
                    preferredSkillEntries: [],
                    skillEntries: []
                }))
            } as any,
            {
                getUserPreferenceByAssistantId: jest.fn(async () => null)
            } as any
        )

        const result = await service.getRuntimeCapabilities({
            id: 'clawxpert',
            workspaceId: 'workspace-1',
            agent: {
                key: 'agent-1'
            },
            graph: {
                nodes: [
                    {
                        key: 'skills-middleware',
                        type: 'workflow',
                        entity: {
                            type: WorkflowNodeTypeEnum.MIDDLEWARE,
                            provider: 'skillsMiddleware'
                        }
                    }
                ],
                connections: [{ type: 'workflow', from: 'agent-1', to: 'skills-middleware' }]
            }
        } as any)

        expect(result.skills).toEqual([
            {
                id: 'documents-skill',
                workspaceId: 'workspace-1',
                label: 'documents',
                description: undefined,
                repositoryName: undefined,
                provider: undefined,
                meta: {
                    color: '#2563EB'
                }
            }
        ])
    })

    it('does not page workspace skills when building runtime capabilities', async () => {
        const skillPackages = Array.from({ length: 12 }, (_, index) => {
            const id = `skill-${index + 1}`
            return {
                id,
                workspaceId: 'workspace-1',
                name: id,
                skillIndex: {
                    name: id
                }
            }
        })
        const getAllByWorkspaceForRuntime = jest.fn(async (_workspaceId: string, query: { take?: number }) => ({
            items: skillPackages.slice(0, typeof query.take === 'number' ? query.take : skillPackages.length)
        }))
        const service = new RuntimeCapabilitiesService(
            { get: jest.fn() } as unknown as ConstructorParameters<typeof RuntimeCapabilitiesService>[0],
            { getAllByWorkspaceForRuntime } as unknown as ConstructorParameters<typeof RuntimeCapabilitiesService>[1],
            new RuntimeCommandService(),
            {
                resolveRuntimeCommandProfile: jest.fn(async () => ({
                    hasProfile: false,
                    xpertCommands: [],
                    workspaceCommands: [],
                    preferredSkillEntries: [],
                    skillEntries: []
                }))
            } as unknown as ConstructorParameters<typeof RuntimeCapabilitiesService>[3],
            {
                getUserPreferenceByAssistantId: jest.fn(async () => null)
            } as unknown as ConstructorParameters<typeof RuntimeCapabilitiesService>[4]
        )

        const result = await service.getRuntimeCapabilities({
            id: 'clawxpert',
            slug: 'clawxpert',
            name: 'ClawXpert',
            type: XpertTypeEnum.Agent,
            workspaceId: 'workspace-1',
            agent: {
                key: 'agent-1'
            },
            graph: {
                nodes: [
                    {
                        key: 'skills-middleware',
                        type: 'workflow',
                        entity: {
                            type: WorkflowNodeTypeEnum.MIDDLEWARE,
                            provider: 'skillsMiddleware'
                        }
                    }
                ],
                connections: [{ type: 'workflow', from: 'agent-1', to: 'skills-middleware' }]
            }
        } as unknown as Parameters<RuntimeCapabilitiesService['getRuntimeCapabilities']>[0])

        expect(result.skills.map((skill) => skill.id)).toEqual(skillPackages.map((skill) => skill.id))
        const query = getAllByWorkspaceForRuntime.mock.calls[0]?.[1]
        expect(query).not.toHaveProperty('take')
        expect(query).not.toHaveProperty('skip')
    })

    it('counts accessible Workspace skills even when the primary Agent does not mount Skills Middleware', async () => {
        const getAllByWorkspaceForRuntime = jest.fn(async () => ({
            items: [
                { id: 'skill-a', workspaceId: 'workspace-1' },
                { id: 'skill-b', workspaceId: 'workspace-1' },
                { id: 'skill-c', workspaceId: 'workspace-1' }
            ]
        }))
        const getUserPreferenceByAssistantId = jest.fn(async () => ({
            toolPreferences: {
                version: 1,
                skills: {
                    'workspace-1': {
                        workspaceId: 'workspace-1',
                        disabledSkillIds: ['skill-b']
                    }
                }
            }
        }))
        const service = new RuntimeCapabilitiesService(
            { get: jest.fn() } as unknown as ConstructorParameters<typeof RuntimeCapabilitiesService>[0],
            { getAllByWorkspaceForRuntime } as unknown as ConstructorParameters<typeof RuntimeCapabilitiesService>[1],
            new RuntimeCommandService(),
            {
                resolveRuntimeCommandProfile: jest.fn()
            } as unknown as ConstructorParameters<typeof RuntimeCapabilitiesService>[3],
            { getUserPreferenceByAssistantId } as unknown as ConstructorParameters<typeof RuntimeCapabilitiesService>[4]
        )

        await expect(
            service.countAccessibleWorkspaceSkills(
                {
                    id: 'assistant-1',
                    workspaceId: 'workspace-1',
                    graph: { nodes: [], connections: [] }
                } as unknown as Parameters<RuntimeCapabilitiesService['countAccessibleWorkspaceSkills']>[0],
                'assistant-1'
            )
        ).resolves.toBe(2)

        expect(getUserPreferenceByAssistantId).toHaveBeenCalledWith('assistant-1')
        expect(getAllByWorkspaceForRuntime).toHaveBeenCalledWith(
            'workspace-1',
            expect.objectContaining({
                relations: ['skillIndex', 'skillIndex.repository'],
                withDeleted: false
            }),
            false,
            null
        )
    })

    it('keeps all enabled Xpert skills and adds enabled Project skills using distinct source identities', async () => {
        const getAllByWorkspaceForRuntime = jest.fn(async () => ({
            items: [
                {
                    id: 'docx-editor',
                    workspaceId: 'workspace-1',
                    name: 'docx-editor',
                    skillIndex: { name: 'docx-editor' }
                },
                {
                    id: 'workspace-private',
                    workspaceId: 'workspace-1',
                    name: 'workspace-private',
                    skillIndex: { name: 'workspace-private' }
                }
            ]
        }))
        const assertCanUseXpert = jest.fn(async () => ({
            project: { id: 'project-1', name: 'Workbench 1' },
            role: 'member'
        }))
        const listSkills = jest.fn(async () => ({
            items: [
                {
                    id: 'pdf',
                    name: 'pdf',
                    description: 'Read PDF files',
                    path: 'skills/pdf/SKILL.md',
                    enabled: true,
                    source: 'repository'
                },
                {
                    id: 'disabled',
                    name: 'disabled',
                    path: 'skills/disabled/SKILL.md',
                    enabled: false,
                    source: 'upload'
                }
            ],
            total: 2
        }))
        const moduleRef = {
            get: jest.fn((token: unknown) => {
                if (token === XpertProjectAccessService) return { assertCanUseXpert }
                if (token === XpertProjectContentService) return { listSkills }
                return undefined
            })
        }
        const service = new RuntimeCapabilitiesService(
            { get: jest.fn() } as unknown as ConstructorParameters<typeof RuntimeCapabilitiesService>[0],
            { getAllByWorkspaceForRuntime } as unknown as ConstructorParameters<typeof RuntimeCapabilitiesService>[1],
            new RuntimeCommandService(),
            {
                resolveRuntimeCommandProfile: jest.fn(async () => ({
                    hasProfile: false,
                    xpertCommands: [],
                    workspaceCommands: [],
                    preferredSkillEntries: [],
                    skillEntries: []
                }))
            } as unknown as ConstructorParameters<typeof RuntimeCapabilitiesService>[3],
            {
                getUserPreferenceByAssistantId: jest.fn(async () => null)
            } as unknown as ConstructorParameters<typeof RuntimeCapabilitiesService>[4],
            moduleRef as unknown as ConstructorParameters<typeof RuntimeCapabilitiesService>[5]
        )

        const result = await service.getRuntimeCapabilities(
            {
                id: 'xpert-1',
                name: 'DOCX assistant',
                workspaceId: 'workspace-1',
                agent: { key: 'agent-1' },
                graph: {
                    nodes: [
                        {
                            key: 'skills-middleware',
                            type: 'workflow',
                            entity: {
                                type: WorkflowNodeTypeEnum.MIDDLEWARE,
                                provider: 'skillsMiddleware',
                                options: { skills: ['docx-editor'] }
                            }
                        }
                    ],
                    connections: [{ type: 'workflow', from: 'agent-1', to: 'skills-middleware' }]
                }
            } as unknown as Parameters<RuntimeCapabilitiesService['getRuntimeCapabilities']>[0],
            'xpert-1',
            'project-1'
        )

        expect(assertCanUseXpert).toHaveBeenCalledWith('project-1', 'xpert-1')
        expect(listSkills).toHaveBeenCalledWith('project-1')
        expect(getAllByWorkspaceForRuntime.mock.calls[0].slice(0, 3)).toEqual([
            'workspace-1',
            expect.objectContaining({ relations: ['skillIndex', 'skillIndex.repository'] }),
            false
        ])
        expect(result.skills.map((skill) => skill.label)).toEqual(['docx-editor', 'workspace-private', 'pdf'])
        expect(result.skills).toEqual([
            expect.objectContaining({
                id: createRuntimeSkillCapabilityId({
                    type: 'xpert',
                    ownerId: 'xpert-1',
                    skillId: 'docx-editor'
                }),
                workspaceId: 'workspace-1',
                default: true,
                meta: expect.objectContaining({
                    skillSource: {
                        type: 'xpert',
                        ownerId: 'xpert-1',
                        label: 'DOCX assistant',
                        skillId: 'docx-editor'
                    }
                })
            }),
            expect.objectContaining({
                id: createRuntimeSkillCapabilityId({
                    type: 'xpert',
                    ownerId: 'xpert-1',
                    skillId: 'workspace-private'
                }),
                workspaceId: 'workspace-1',
                meta: expect.objectContaining({
                    skillSource: {
                        type: 'xpert',
                        ownerId: 'xpert-1',
                        label: 'DOCX assistant',
                        skillId: 'workspace-private'
                    }
                })
            }),
            {
                id: createRuntimeSkillCapabilityId({
                    type: 'project',
                    ownerId: 'project-1',
                    skillId: 'pdf'
                }),
                workspaceId: 'project:project-1',
                label: 'pdf',
                description: 'Read PDF files',
                provider: 'project',
                meta: {
                    skillSource: {
                        type: 'project',
                        ownerId: 'project-1',
                        label: 'Workbench 1',
                        skillId: 'pdf'
                    }
                },
                default: true
            }
        ])
    })
})
