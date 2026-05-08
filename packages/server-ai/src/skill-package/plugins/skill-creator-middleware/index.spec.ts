jest.mock('@xpert-ai/plugin-sdk', () => ({
    AgentMiddlewareStrategy: () => (target: unknown) => target
}))

import { SystemMessage } from '@langchain/core/messages'
import {
    CreateWorkspaceSkillCommand,
    DeleteWorkspaceSkillCommand,
    GetWorkspaceSkillForEditQuery,
    UpdateWorkspaceSkillCommand
} from '../../authoring/skill-creator-cqrs'
import { SkillCreatorMiddleware } from './index'

describe('SkillCreatorMiddleware', () => {
    let commandBus: { execute: jest.Mock }
    let queryBus: { execute: jest.Mock }
    let middleware: Awaited<ReturnType<SkillCreatorMiddleware['createMiddleware']>>

    beforeEach(async () => {
        commandBus = { execute: jest.fn().mockResolvedValue({ status: 'applied' }) }
        queryBus = { execute: jest.fn().mockResolvedValue({ status: 'found' }) }
        middleware = await Promise.resolve(
            new SkillCreatorMiddleware(commandBus as any, queryBus as any).createMiddleware({}, {
                workspaceId: 'workspace-1'
            } as any)
        )
    })

    const getTool = (name: string) => middleware.tools?.find((item) => item.name === name)!

    it('exposes only workspace skill authoring tools', () => {
        const toolNames = middleware.tools?.map((tool) => tool.name)

        expect(toolNames).toEqual([
            'create_workspace_skill',
            'get_workspace_skill_for_edit',
            'update_workspace_skill',
            'delete_workspace_skill'
        ])
        expect(toolNames).not.toContain('read_skill_file')
        expect(toolNames).not.toContain('search_skill_repository')
        expect(toolNames).not.toContain('install_workspace_skills')
    })

    it('exposes tool schemas without workspace context but rejects authoring calls', async () => {
        const schemaOnlyMiddleware = await Promise.resolve(
            new SkillCreatorMiddleware(commandBus as any, queryBus as any).createMiddleware({}, {} as any)
        )
        const createTool = schemaOnlyMiddleware.tools?.find((item) => item.name === 'create_workspace_skill')!

        expect(schemaOnlyMiddleware.tools?.map((tool) => tool.name)).toContain('create_workspace_skill')
        await expect(
            createTool.invoke({
                userIntent: 'Create image editor skill',
                skillMarkdown: '---\nname: image-editor\ndescription: Edit images.\n---\n# Image Editor\n'
            })
        ).resolves.toMatchObject({
            status: 'rejected',
            summary: 'workspaceId is required for skillCreatorMiddleware tools.'
        })
        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it('adds authoring instructions without listing runtime skills', async () => {
        const handler = jest.fn(async (request) => request)

        await middleware.wrapModelCall?.(
            {
                systemMessage: new SystemMessage('base instructions')
            } as never,
            handler
        )

        const request = handler.mock.calls[0][0]
        expect(request.systemMessage.content).toContain('## Skill Creator')
        expect(request.systemMessage.content).toContain('authoring-only')
        expect(request.systemMessage.content).toContain('Do not ask where to create the skill in V1')
        expect(request.systemMessage.content).toContain('Use get_workspace_skill_for_edit before updating')
        expect(request.systemMessage.content).not.toContain('Available Skills:')
    })

    it('dispatches tool calls to the host authoring adapter', async () => {
        await getTool('create_workspace_skill').invoke({
            userIntent: 'Create image editor skill',
            skillMarkdown: '---\nname: image-editor\ndescription: Edit images.\n---\n# Image Editor\n',
            files: [
                {
                    path: 'references/workflows.md',
                    content: '# Workflows\n'
                }
            ]
        })
        expect(commandBus.execute.mock.calls[0][0]).toBeInstanceOf(CreateWorkspaceSkillCommand)
        expect(commandBus.execute.mock.calls[0][0].payload.files).toEqual([
            {
                path: 'references/workflows.md',
                content: '# Workflows\n'
            }
        ])

        await getTool('get_workspace_skill_for_edit').invoke({
            skillRef: { name: 'image-editor' }
        })
        expect(queryBus.execute.mock.calls[0][0]).toBeInstanceOf(GetWorkspaceSkillForEditQuery)

        await getTool('update_workspace_skill').invoke({
            skillRef: { name: 'image-editor' },
            skillMarkdown: '---\nname: image-editor\ndescription: Edit images safely.\n---\n# Image Editor\n'
        })
        expect(commandBus.execute.mock.calls[1][0]).toBeInstanceOf(UpdateWorkspaceSkillCommand)

        await getTool('delete_workspace_skill').invoke({
            skillRef: { packagePath: 'image-editor' }
        })
        expect(commandBus.execute.mock.calls[2][0]).toBeInstanceOf(DeleteWorkspaceSkillCommand)
    })
})
