import type {
    McpPromptCapabilityDescriptor,
    McpResourceTemplateCapabilityDescriptor,
    McpToolCapabilityDescriptor
} from '@xpert-ai/contracts'
import {
    assertValidMcpCapabilityDescriptor,
    compareMcpCapabilityDescriptors,
    hashMcpCapabilityDescriptor
} from './capability-descriptor'

function descriptor(overrides: Partial<McpToolCapabilityDescriptor> = {}): McpToolCapabilityDescriptor {
    return {
        descriptorVersion: 1,
        capabilityType: 'tool',
        capabilityKey: 'search_document',
        title: 'Search documents',
        description: 'Searches documents.',
        source: { toolsetId: 'toolset-1', pluginName: '@xpert-ai/plugin-docs', pluginVersion: '1.0.0' },
        requiredContext: ['workspace', 'principal'],
        visibility: ['model'],
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string' }
            },
            required: ['query']
        },
        outputSchema: {
            type: 'object',
            properties: {
                items: { type: 'array' }
            }
        },
        behavior: { risk: 'read', sideEffect: 'none', idempotency: 'safe' },
        ...overrides
    }
}

describe('MCP capability descriptor compatibility', () => {
    it('hashes the semantic descriptor independently of source instance and object key order', () => {
        const first = descriptor()
        const second = descriptor({
            source: { toolsetId: 'toolset-2', pluginName: '@xpert-ai/plugin-docs', pluginVersion: '1.1.0' },
            inputSchema: {
                required: ['query'],
                properties: { query: { type: 'string' } },
                type: 'object'
            }
        })

        expect(hashMcpCapabilityDescriptor(first)).toBe(hashMcpCapabilityDescriptor(second))
    })

    it('keeps external MCP routing changes in the semantic hash', () => {
        const first = descriptor({
            source: { toolsetId: 'toolset-1', serverName: 'primary', remoteName: 'search' }
        })
        const second = descriptor({
            source: { toolsetId: 'toolset-1', serverName: 'secondary', remoteName: 'search' }
        })

        expect(hashMcpCapabilityDescriptor(first)).not.toBe(hashMcpCapabilityDescriptor(second))
        expect(compareMcpCapabilityDescriptors(first, second)).toMatchObject({
            changed: true,
            breaking: true,
            reasons: ['capability remote routing changed']
        })
    })

    it('requires review when provider instructions change and bounds their persisted size', () => {
        const updated = descriptor({ providerInstructions: 'Use resource references before search.' })

        expect(hashMcpCapabilityDescriptor(descriptor())).not.toBe(hashMcpCapabilityDescriptor(updated))
        expect(compareMcpCapabilityDescriptors(descriptor(), updated)).toMatchObject({
            changed: true,
            breaking: true,
            reasons: ['provider instructions changed']
        })
        expect(() =>
            assertValidMcpCapabilityDescriptor(descriptor({ providerInstructions: 'x'.repeat(8_001) }))
        ).toThrow('provider instructions is invalid')
    })

    it('allows optional schema additions but requires review for required inputs and risk escalation', () => {
        const optionalAddition = descriptor({
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string' },
                    limit: { type: 'number' }
                },
                required: ['query']
            }
        })
        const requiredAddition = descriptor({
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string' },
                    environment: { type: 'string' }
                },
                required: ['query', 'environment']
            }
        })
        const riskEscalation = descriptor({
            behavior: { risk: 'write', sideEffect: 'reversible', idempotency: 'idempotent' }
        })

        expect(compareMcpCapabilityDescriptors(descriptor(), optionalAddition)).toMatchObject({
            changed: true,
            breaking: false
        })
        expect(compareMcpCapabilityDescriptors(descriptor(), requiredAddition)).toMatchObject({
            changed: true,
            breaking: true
        })
        expect(compareMcpCapabilityDescriptors(descriptor(), riskEscalation)).toMatchObject({
            changed: true,
            breaking: true
        })
    })

    it('requires review when a resource template MIME type changes', () => {
        const template: McpResourceTemplateCapabilityDescriptor = {
            descriptorVersion: 1,
            capabilityType: 'resource_template',
            capabilityKey: 'document',
            source: { toolsetId: 'toolset-1' },
            requiredContext: ['workspace'],
            visibility: ['model'],
            uriTemplate: 'xpert://documents/{documentId}',
            mimeType: 'application/json',
            argumentSchema: { type: 'object' },
            supportsCompletion: false
        }

        expect(compareMcpCapabilityDescriptors(template, { ...template, mimeType: 'text/markdown' })).toMatchObject({
            changed: true,
            breaking: true,
            reasons: ['resource template MIME type changed']
        })
    })

    it('requires review when prompt completion is removed', () => {
        const prompt: McpPromptCapabilityDescriptor = {
            descriptorVersion: 1,
            capabilityType: 'prompt',
            capabilityKey: 'review',
            source: { toolsetId: 'toolset-1' },
            requiredContext: ['workspace'],
            visibility: ['model'],
            name: 'review',
            argumentSchema: { type: 'object' },
            supportsCompletion: true
        }

        expect(compareMcpCapabilityDescriptors(prompt, { ...prompt, supportsCompletion: false })).toMatchObject({
            changed: true,
            breaking: true,
            reasons: ['prompt completion was removed']
        })
    })
})
