import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'

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
                getAllByWorkspace: jest.fn(async () => ({
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
})
