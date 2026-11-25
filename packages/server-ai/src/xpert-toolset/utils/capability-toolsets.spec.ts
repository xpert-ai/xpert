import {
    XpertToolsetCategoryEnum,
    type AssistantCapabilityToolsetRequirement,
    type IXpertToolset
} from '@xpert-ai/contracts'
import { resolveCapabilityToolsets } from './capability-toolsets'

const requirement: AssistantCapabilityToolsetRequirement = {
    bindingKey: 'sample.documents',
    category: 'mcp',
    requiredTools: ['find_documents']
}
const connection = (): IXpertToolset => ({
    id: 'connection',
    name: 'Arbitrary display name',
    type: 'mcp',
    category: XpertToolsetCategoryEnum.MCP,
    options: { capabilityBindingKey: requirement.bindingKey },
    tools: [{ name: 'find_documents' }],
    schema: 'private endpoint and headers',
    credentials: { apiKey: 'private' }
})

describe('capability connection resolution', () => {
    it('selects explicit identity and returns only credential-free graph metadata', () => {
        const result = resolveCapabilityToolsets([requirement], [connection()])
        expect(result[0].toolset).toEqual({
            id: 'connection',
            name: 'Arbitrary display name',
            type: 'mcp',
            category: 'mcp',
            options: { capabilityBindingKey: requirement.bindingKey }
        })
        expect(JSON.stringify(result)).not.toContain('private')
    })
    it('rejects missing and duplicate identities instead of guessing from names or tools', () => {
        expect(() =>
            resolveCapabilityToolsets([requirement], [{ ...connection(), name: requirement.bindingKey, options: {} }])
        ).toThrow()
        expect(() =>
            resolveCapabilityToolsets([requirement], [connection(), { ...connection(), id: 'other' }])
        ).toThrow()
    })
    it('rejects incompatible categories, missing tools and disabled required tools', () => {
        for (const toolset of [
            { ...connection(), category: XpertToolsetCategoryEnum.API },
            { ...connection(), tools: [] },
            { ...connection(), tools: [{ name: 'find_documents', disabled: true }] },
            { ...connection(), options: { ...connection().options, disableToolDefault: true } }
        ])
            expect(() => resolveCapabilityToolsets([requirement], [toolset])).toThrow()
    })
})
