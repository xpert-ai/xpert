jest.mock('../sandbox/middlewares/file-activity-storage.service', () => ({ FileActivityStorage: class {} }))

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { IWFNMiddleware, isMiddlewareToolEnabled, TXpertTeamNode, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { SandboxFileMiddleware } from '../sandbox/middlewares/sandbox-file.middleware'
import { TodoListMiddleware } from '../xpert-middleware/todo-list.middleware'
import { parseCapabilityTemplateDraft } from './capabilities/template-draft'

const load = (path: string) => parseCapabilityTemplateDraft(readFileSync(join(__dirname, path), 'utf8'))
const local = 'templates/xpert-bosi-desktop.yaml'

function isMiddleware(node: TXpertTeamNode): node is TXpertTeamNode<'workflow'> & { entity: IWFNMiddleware } {
    return node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE
}

describe('Bosi Desktop template capability contracts', () => {
    it.each([[local, '3']])('%s binds its core capabilities directly and once', (file, version) => {
        const draft = load(file)
        const agent = draft.nodes.find((node) => node.type === 'agent' && node.key === draft.team.agent?.key)
        if (agent?.type !== 'agent') throw new Error('Missing primary Agent')
        const nodes = draft.nodes.filter(isMiddleware)
        expect(draft.team.version).toBe(version)
        expect(draft.team.copilotModel).toBeNull()
        expect(draft.team.features.sandbox).toEqual({ enabled: true, provider: 'docker-sandbox' })
        expect(draft.team.knowledgebases).toEqual([])
        expect(draft.team.toolsets).toEqual([])
        expect(agent.entity.options.parallelToolCalls).toBe(false)
        expect(new Set(draft.nodes.map(({ key }) => key)).size).toBe(draft.nodes.length)
        expect(new Set(nodes.map(({ entity }) => entity.provider)).size).toBe(nodes.length)
        expect([...agent.entity.options.middlewares.order].sort()).toEqual(nodes.map(({ key }) => key).sort())
        expect(draft.connections).toHaveLength(nodes.length)
        for (const node of nodes) {
            expect(node.entity.required).toBe(true)
            expect(draft.connections.filter((edge) => edge.to === node.key)).toEqual([
                {
                    key: `${agent.key}/${node.key}`,
                    from: agent.key,
                    to: node.key,
                    type: 'workflow',
                    required: true
                }
            ])
        }
        const declaredTools = nodes.flatMap(({ entity }) =>
            Object.entries(entity.tools ?? {})
                .filter(([, config]) => isMiddlewareToolEnabled(config))
                .map(([name]) => name)
        )
        expect(new Set(declaredTools).size).toBe(declaredTools.length)
        expect(declaredTools).toEqual(expect.arrayContaining(['write_todos', 'read_skill_file', 'present_files']))
        expect(nodes.some(({ entity }) => entity.provider === 'ClientToolMiddleware')).toBe(false)
        expect(nodes.some(({ entity }) => entity.provider === 'SummarizationMiddleware')).toBe(false)
        expect(agent.entity.prompt).toContain('workspace-relative paths')
        expect(agent.entity.prompt).toContain('private version-pinned conversation cards')
    })

    it.each([local])('%s enables the real file and planning tool sets without guessing names', async (file) => {
        const draft = load(file)
        const nodes = draft.nodes.filter(isMiddleware)
        const files = nodes.find(({ entity }) => entity.provider === 'SandboxFile')
        const todos = nodes.find(({ entity }) => entity.provider === 'todoListMiddleware')
        if (!files || !todos) throw new Error('Missing file or planning middleware')
        const context: IAgentMiddlewareContext = {
            tenantId: 'test-tenant',
            userId: 'test-user',
            threadId: 'test-thread',
            node: files.entity,
            xpertFeatures: draft.team.features,
            tools: new Map(),
            runtime: {
                createModelClient: async () => {
                    throw new Error('No model used by this test')
                },
                wrapWorkflowNodeExecution: async () => {
                    throw new Error('No workflow used by this test')
                }
            }
        }
        const fileMiddleware = await new SandboxFileMiddleware({ persist: jest.fn() }).createMiddleware({}, context)
        const todoMiddleware = await new TodoListMiddleware().createMiddleware({})
        for (const [node, middleware] of [
            [files, fileMiddleware],
            [todos, todoMiddleware]
        ] as const) {
            const actual = middleware.tools.map(({ name }) => name).sort()
            expect(Object.keys(node.entity.tools).sort()).toEqual(actual)
            expect(actual.every((name) => isMiddlewareToolEnabled(node.entity.tools[name]))).toBe(true)
        }
    })

    it('keeps local computer operations separate from cloud workspace tools', () => {
        const nodes = load(local).nodes.filter(isMiddleware)
        expect(nodes.map(({ entity }) => entity.provider).sort()).toEqual(
            [
                'ContextCompressionMiddleware',
                'DesktopShell',
                'SandboxFile',
                'skillsMiddleware',
                'todoListMiddleware'
            ].sort()
        )
        expect(nodes.find(({ entity }) => entity.provider === 'skillsMiddleware')?.entity.options).toEqual({})
    })
})
