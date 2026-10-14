import { XpertTypeEnum, type TXpertTemplate } from '@xpert-ai/contracts'
import { stringify } from 'yaml'
import { describeAssistantTemplate } from './assistant-template-overview'

const graph = {
    team: {
        type: 'agent',
        agent: { key: 'primary' },
        options: {
            operationPolicy: {
                default: 'approve',
                rules: [{ tool: 'send', decision: 'deny', reason: 'Draft only' }]
            }
        }
    },
    nodes: [
        {
            key: 'primary',
            type: 'agent',
            entity: { key: 'primary', title: 'Office', prompt: 'Prepare a draft.', privateKey: 'never-expose' }
        },
        { key: 'secondary', type: 'agent', entity: { key: 'secondary', prompt: 'internal-secondary-instructions' } }
    ],
    connections: [],
    memories: [
        { prefix: 'QA', value: { question: 'Default output?', answer: 'Draft', privateKey: 'never-expose' } },
        { prefix: 'Structured knowledge', value: { privateKey: 'never-expose' } }
    ],
    template: {
        schemaVersion: 2,
        dependencies: { skills: [{ pluginName: '@test/office', componentKey: 'setup' }] },
        manifest: {
            schemaVersion: 2,
            version: '1',
            files: {
                scope: 'user',
                entries: [
                    {
                        kind: 'file',
                        path: 'office.md',
                        content: 'private-file-body',
                        contentVersion: '1',
                        policy: 'create-only'
                    }
                ]
            },
            onboarding: {
                skill: 'setup',
                required: true,
                preferences: ['timezone'],
                completionCriteria: 'Provide a welcome plan'
            },
            connectors: [
                {
                    key: 'calendar',
                    provider: 'google-calendar',
                    purpose: 'Review events',
                    required: false,
                    permissions: ['calendar.read']
                }
            ],
            routines: [
                {
                    key: 'weekly',
                    trigger: 'schedule',
                    expression: '0 9 * * 1',
                    timezone: 'user',
                    skill: 'setup',
                    output: 'Weekly draft',
                    enabled: false
                }
            ]
        }
    }
}
const template: TXpertTemplate = {
    id: 'office',
    name: 'office',
    title: 'Office',
    description: 'Office work',
    copyright: 'Author',
    category: 'assistant',
    avatar: {},
    type: XpertTypeEnum.Agent,
    export_data: stringify(graph)
}

describe('Assistant template overview', () => {
    it('projects all four sections from the Assistant definition without runtime or raw configuration data', () => {
        const result = describeAssistantTemplate(template)
        expect(result).toMatchObject({
            title: 'Office',
            publisher: 'Author',
            instructions: 'Prepare a draft.',
            memories: [{ title: 'Default output?', content: 'Draft' }, { title: 'Structured knowledge' }],
            skills: [{ pluginName: '@test/office', componentKey: 'setup' }],
            files: { scope: 'user', paths: ['office.md'] },
            onboarding: { preferences: ['timezone'] },
            routines: [{ enabled: false, output: 'Weekly draft' }],
            integrations: [{ kind: 'connector', required: false, permissions: ['calendar.read'] }],
            operationPolicy: { default: 'approve', rules: [{ decision: 'deny' }] }
        })
        expect(JSON.stringify(result)).not.toMatch(
            /never-expose|private-file-body|internal-secondary-instructions|export_data/
        )
        expect(template.export_data).toBe(stringify(graph))
    })
    it('supports legacy templates with no manifest and empty capability sections', () => {
        const result = describeAssistantTemplate({
            ...template,
            copyright: '',
            pluginDisplayName: 'Office publisher',
            export_data: stringify({ team: { type: 'agent' }, nodes: [], connections: [] })
        })
        expect(result).toMatchObject({
            publisher: 'Office publisher',
            instructions: '',
            memories: [],
            skills: [],
            routines: [],
            integrations: []
        })
    })
    it('preserves conflicting metadata validation instead of describing a different definition from installation', () => {
        expect(() =>
            describeAssistantTemplate({ ...template, manifest: { schemaVersion: 2, version: 'other' } })
        ).toThrow()
    })
})
