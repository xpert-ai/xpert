import { WorkflowNodeTypeEnum, XpertTypeEnum } from '@xpert-ai/contracts'

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
})
