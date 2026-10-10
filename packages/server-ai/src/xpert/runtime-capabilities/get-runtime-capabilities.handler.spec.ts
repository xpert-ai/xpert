import { ForbiddenException } from '@nestjs/common'
import { CommandBus, CqrsModule } from '@nestjs/cqrs'
import { Test, TestingModule } from '@nestjs/testing'
import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'
import { AssistantBindingService } from '../../assistant-binding/assistant-binding.service'
import { PromptWorkflowService } from '../../prompt-workflow/prompt-workflow.service'
import { SkillPackageService } from '../../skill-package/skill-package.service'
import { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'
import { XpertProjectContentService } from '../../xpert-project/services/project-content.service'
import { Xpert } from '../xpert.entity'
import { GetRuntimeCapabilitiesCommand } from './get-runtime-capabilities.command'
import { GetRuntimeCapabilitiesHandler } from './get-runtime-capabilities.handler'
import { RuntimeCapabilitiesService } from './runtime-capabilities.service'
import { RuntimeCommandService } from './runtime-command.service'

describe('runtime capabilities command with explicit Project dependencies', () => {
    const access = { assertCanUseXpert: jest.fn() }
    const content = { listSkills: jest.fn() }
    const skills = { getAllByWorkspaceForRuntime: jest.fn() }
    const binding = { getUserPreferenceByAssistantId: jest.fn() }
    const prompts = { resolveRuntimeCommandProfile: jest.fn() }
    const xpert = Object.assign(new Xpert(), {
        id: 'assistant',
        name: 'Assistant',
        workspaceId: 'workspace',
        agent: { key: 'agent' },
        graph: {
            nodes: [
                {
                    key: 'skills',
                    type: 'workflow',
                    entity: {
                        type: WorkflowNodeTypeEnum.MIDDLEWARE,
                        provider: 'skillsMiddleware'
                    }
                }
            ],
            connections: [{ type: 'workflow', from: 'agent', to: 'skills' }]
        }
    })
    let module: TestingModule
    let bus: CommandBus

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [CqrsModule],
            providers: [
                GetRuntimeCapabilitiesHandler,
                RuntimeCapabilitiesService,
                RuntimeCommandService,
                { provide: AgentMiddlewareRegistry, useValue: { get: jest.fn() } },
                { provide: AssistantBindingService, useValue: binding },
                { provide: PromptWorkflowService, useValue: prompts },
                { provide: SkillPackageService, useValue: skills },
                { provide: XpertProjectAccessService, useValue: access },
                { provide: XpertProjectContentService, useValue: content }
            ]
        }).compile()
        await module.init()
        bus = module.get(CommandBus)
    })
    beforeEach(() => {
        jest.clearAllMocks()
        access.assertCanUseXpert.mockResolvedValue({ project: { id: 'project', name: 'Project' }, role: 'member' })
        content.listSkills.mockResolvedValue({ items: [], total: 0 })
        skills.getAllByWorkspaceForRuntime.mockResolvedValue({ items: [], total: 0 })
        binding.getUserPreferenceByAssistantId.mockResolvedValue(null)
        prompts.resolveRuntimeCommandProfile.mockResolvedValue({
            hasProfile: false,
            xpertCommands: [],
            workspaceCommands: [],
            preferredSkillEntries: [],
            skillEntries: []
        })
    })
    afterAll(async () => module?.close())

    it('resolves a registered command without reading Project services for ordinary Chat', async () => {
        await expect(bus.execute(new GetRuntimeCapabilitiesCommand(xpert, xpert.id))).resolves.toEqual({
            skills: [],
            plugins: [],
            subAgents: [],
            commands: []
        })
        expect(skills.getAllByWorkspaceForRuntime).toHaveBeenCalledTimes(1)
        expect(access.assertCanUseXpert).not.toHaveBeenCalled()
        expect(content.listSkills).not.toHaveBeenCalled()
    })

    it('passes normalized Project scope through the shared handler to injected services', async () => {
        await bus.execute(new GetRuntimeCapabilitiesCommand(xpert, xpert.id, ' project '))
        expect(access.assertCanUseXpert).toHaveBeenCalledWith('project', 'assistant')
        expect(content.listSkills).toHaveBeenCalledWith('project')
        expect(content.listSkills).toHaveBeenCalledTimes(1)
    })

    it('stops before enumerating capabilities when Project access is rejected', async () => {
        const denied = new ForbiddenException()
        access.assertCanUseXpert.mockRejectedValueOnce(denied)
        await expect(bus.execute(new GetRuntimeCapabilitiesCommand(xpert, xpert.id, 'project'))).rejects.toBe(denied)
        expect(content.listSkills).not.toHaveBeenCalled()
        expect(skills.getAllByWorkspaceForRuntime).not.toHaveBeenCalled()
        expect(binding.getUserPreferenceByAssistantId).not.toHaveBeenCalled()
        expect(prompts.resolveRuntimeCommandProfile).not.toHaveBeenCalled()
    })
})
