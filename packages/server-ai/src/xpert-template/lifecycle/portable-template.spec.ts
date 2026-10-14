import { IWFNMiddleware, WorkflowNodeTypeEnum, TXpertTeamDraft } from '@xpert-ai/contracts'
import { portableDraft, portableTemplate, portableTemplateSchema } from './portable-template'
import { templateBaseline } from './template-baseline'
import { mergeTemplateUpgrade } from '../../xpert/template-lifecycle/template-upgrade-merge'

const content = () =>
    portableTemplateSchema.parse({
        presentation: { title: 'Office', description: '', starters: [] },
        instructions: {
            primary: 'primary',
            agents: [
                { key: 'primary', name: 'office', title: 'Office', description: '', prompt: 'Original instructions' }
            ]
        },
        runtime: {
            sandbox: true,
            middleware: [{ key: 'files', provider: 'SandboxFile', required: true, tools: { sandbox_read_file: true } }],
            connections: [{ from: 'primary', to: 'files', type: 'workflow', required: true }]
        },
        definition: {
            metadata: {
                schemaVersion: 2,
                dependencies: { skills: [{ pluginName: '@test/office', componentKey: 'getting-started' }] }
            },
            policy: { default: 'approve', rules: [] }
        }
    })
describe('portable template projection and merge', () => {
    it('keeps declared instructions, runtime, dependencies and policy round-trip', () => {
        expect(portableTemplate(portableDraft(content())).content).toEqual(content())
    })
    it('excludes local model, identities, connector accounts and generated skill IDs', () => {
        const draft = portableDraft(content())
        draft.team.id = 'PRIVATE_ASSISTANT'
        draft.team.organizationId = 'PRIVATE_ORG'
        draft.team.copilotModel = { copilotId: 'PRIVATE_MODEL', model: 'test' }
        draft.team.options.templateDependencyLocks = []
        draft.nodes.push({
            key: 'connector',
            type: 'workflow',
            position: { x: 0, y: 0 },
            entity: {
                id: 'connector',
                key: 'connector',
                type: WorkflowNodeTypeEnum.MIDDLEWARE,
                provider: 'ConnectorMiddleware',
                options: { provider: 'test-provider', connectorId: 'PRIVATE_ACCOUNT' }
            } as IWFNMiddleware
        })
        draft.nodes.push({
            key: 'skills',
            type: 'workflow',
            position: { x: 0, y: 0 },
            entity: {
                id: 'skills',
                key: 'skills',
                type: WorkflowNodeTypeEnum.MIDDLEWARE,
                provider: 'skillsMiddleware',
                options: { skills: ['PRIVATE_SKILL'] }
            } as IWFNMiddleware
        })
        const result = portableTemplate(draft)
        expect(result.blocked).toEqual([])
        expect(JSON.stringify(result.content)).not.toContain('PRIVATE_')
        expect(result.content.definition.policy.default).toBe('approve')
    })
    it('blocks providers without portable adapters instead of sharing arbitrary config', () => {
        const draft = portableDraft(content())
        draft.nodes.push({
            key: 'private',
            type: 'workflow',
            position: { x: 0, y: 0 },
            entity: {
                id: 'private',
                key: 'private',
                type: WorkflowNodeTypeEnum.MIDDLEWARE,
                provider: 'CustomProvider',
                options: { password: 'secret' }
            } as IWFNMiddleware
        })
        expect(portableTemplate(draft).blocked).toEqual(['private: CustomProvider'])
        expect(JSON.stringify(portableTemplate(draft).content)).not.toContain('secret')
        expect(templateBaseline(JSON.stringify(draft))).toBeUndefined()
    })
    it('records section hashes only for supported graphs', () => {
        expect(templateBaseline(JSON.stringify(portableDraft(content())))).toEqual(
            expect.objectContaining({ instructions: expect.stringMatching(/^[a-f0-9]{64}$/) })
        )
    })
    it('keeps instance identity, models and user instruction when chosen', () => {
        const current = portableDraft(content())
        current.team.id = 'identity'
        current.team.name = 'instance-name'
        current.team.copilotModel = { copilotId: 'configured-model', model: 'local' }
        current.team.options.templateSource = { templateId: 'shared-a', templateKey: 'shared-a' }
        const incoming = content()
        incoming.instructions.agents[0].prompt = 'Changed'
        incoming.presentation.title = 'New title'
        const next = mergeTemplateUpgrade(current, incoming, {
            revision: 'r',
            sourceHash: 's',
            choices: { presentation: 'replace', instructions: 'keep' }
        })
        expect(next.team.id).toBe('identity')
        expect(next.team.name).toBe('instance-name')
        expect(next.team.copilotModel).toEqual(current.team.copilotModel)
        expect(next.team.title).toBe('New title')
        expect(next.nodes.find((node) => node.type === 'agent').entity).toEqual(current.nodes[0].entity)
        expect(current.team.title).toBe('Office')
    })
    it('replaces instructions in place with primary Agent and model binding intact', () => {
        const current: TXpertTeamDraft = portableDraft(content())
        if (current.nodes[0].type === 'agent')
            current.nodes[0].entity.copilotModel = { copilotId: 'model', model: 'local' }
        const incoming = content()
        incoming.instructions.agents[0].prompt = 'Updated instructions'
        const result = mergeTemplateUpgrade(current, incoming, {
            revision: 'r',
            sourceHash: 's',
            choices: { instructions: 'replace' }
        })
        const agent = result.nodes.find((node) => node.type === 'agent')
        expect(agent.entity).toEqual(
            expect.objectContaining({
                prompt: 'Updated instructions',
                copilotModel: { copilotId: 'model', model: 'local' }
            })
        )
    })
})
