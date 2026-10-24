import { normalizeAssistantTemplate, normalizeAssistantTemplateDefinition } from './normalize-assistant-template'
import { summarizeAssistantDefinition } from './assistant-capability-structure'
import { stringify } from 'yaml'
import { instanceToPlain } from 'class-transformer'
import { XpertDraftDslDTO } from '../../xpert/dto'
import { templateManifestSchema } from '@xpert-ai/contracts'
jest.mock('yaml', () => {
    const actual = jest.requireActual<typeof import('yaml')>('yaml')
    return { ...actual, stringify: jest.fn(actual.stringify) }
})
const graph = {
    team: { type: 'agent', features: { sandbox: { enabled: true } } },
    nodes: [
        { key: 'a', type: 'agent', entity: { key: 'a' } },
        {
            key: 'm',
            type: 'workflow',
            entity: {
                key: 'm',
                type: 'middleware',
                provider: 'Files',
                tools: { read: true, write: { enabled: false } }
            }
        }
    ],
    connections: [{ key: 'a/m', from: 'a', to: 'm', type: 'workflow' }],
    memories: [{ prefix: 'QA', value: { answer: 'seed' } }]
}
const metadata = {
    schemaVersion: 2,
    dependencies: { skills: [{ pluginName: '@test/skills', componentKey: 'office', targetAgentKey: 'a' }] },
    manifest: {
        schemaVersion: 2,
        version: '1',
        files: {
            scope: 'user',
            entries: [
                { kind: 'file', path: 'office.md', content: 'initial', contentVersion: '1', policy: 'create-only' }
            ]
        }
    }
}

describe('portable Assistant definition', () => {
    afterEach(() => jest.clearAllMocks())
    it('normalizes the same definition and metadata without serializing until an export is requested', () => {
        const input = { export_data: JSON.stringify({ ...graph, template: metadata }) }
        const normalizeOnly = normalizeAssistantTemplateDefinition(input)
        expect(stringify).not.toHaveBeenCalled()
        const exported = normalizeAssistantTemplate(input)
        expect(stringify).toHaveBeenCalledTimes(1)
        expect(exported).toEqual({ ...normalizeOnly, exportData: expect.any(String) })
        expect(exported.exportData).toContain('office.md')
        expect(normalizeAssistantTemplateDefinition({ export_data: exported.exportData })).toEqual(normalizeOnly)
    })
    it('retains declaration validation in the definition-only path', () => {
        expect(() =>
            normalizeAssistantTemplateDefinition({
                export_data: JSON.stringify({ ...graph, template: metadata }),
                dependencies: { skills: [] }
            })
        ).toThrow()
    })
    it('derives skills once, seed memories and sandbox from their owning structures', () => {
        const normalized = normalizeAssistantTemplate({ export_data: stringify({ ...graph, template: metadata }) })
        const summary = summarizeAssistantDefinition(normalized.definition)
        expect(summary).toMatchObject({ seedMemoryCount: 1, sandbox: true, skills: [{ componentKey: 'office' }] })
        expect(summary.skills).toHaveLength(1)
        expect(summary.agents[0].middleware).toEqual([{ provider: 'Files', toolNames: ['read'] }])
        expect(JSON.stringify(summary)).not.toContain('initial')
    })
    it('preserves initialization, dependencies and memories through ordinary DTO export/reimport', () => {
        const definition = normalizeAssistantTemplate({
            export_data: stringify({ ...graph, template: metadata })
        }).definition
        const serialized = stringify(instanceToPlain(new XpertDraftDslDTO(definition)))
        const again = normalizeAssistantTemplate({ export_data: serialized })
        expect(again.definition.template).toEqual(definition.template)
        expect(again.definition.memories).toEqual(graph.memories)
    })
    it('rejects duplicate v2 inputs and conflicting v1 declarations', () => {
        for (const extra of [{ skills: [] }, { memory: { seed: true } }, { execution: { sandbox: 'server' } }])
            expect(templateManifestSchema.safeParse({ schemaVersion: 2, version: '1', ...extra }).success).toBe(false)
        expect(() =>
            normalizeAssistantTemplate({
                export_data: stringify(graph),
                manifest: { schemaVersion: 1, version: '1', memory: { seed: false, preferences: [] } }
            })
        ).toThrow()
        expect(() =>
            normalizeAssistantTemplate({
                export_data: stringify({ ...graph, team: { features: { sandbox: { enabled: false } } } }),
                manifest: { schemaVersion: 1, version: '1', execution: { sandbox: 'server' } }
            })
        ).toThrow()
    })
    it('rejects conflicting delivery metadata and resolves implicit resource ownership once', () => {
        expect(() =>
            normalizeAssistantTemplate({
                export_data: stringify({ ...graph, template: metadata }),
                dependencies: { skills: [] }
            })
        ).toThrow()
        const result = normalizeAssistantTemplate({
            export_data: stringify(graph),
            pluginName: '@test/owner',
            dependencies: { skills: [{ componentKey: 'office' }] }
        })
        expect(result.dependencies.skills).toEqual([{ componentKey: 'office', pluginName: '@test/owner' }])
    })
})
