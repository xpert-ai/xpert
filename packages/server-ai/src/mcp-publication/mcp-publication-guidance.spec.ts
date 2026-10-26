jest.mock('../tool-runtime', () => ({ ToolRuntimeService: class ToolRuntimeService {} }))
import {
    authorizedSubscriptionNotifications,
    mcpCapabilityProviderInstructions,
    mcpPublicationInstructions
} from './mcp-publication-runtime.service'
import { toolCapability, resourceCapability } from './testing/runtime-protocol-fixture'

describe('publication guidance and visibility', () => {
    it('composes platform safety guidance before publication-specific instructions', () => {
        const instructions = mcpPublicationInstructions('Use the published capabilities.')

        expect(instructions).toContain('Xpert-managed MCP publication')
        expect(instructions).toContain('Never request, expose, or forward credentials or tokens')
        expect(instructions).toMatch(/Publication instructions:\nUse the published capabilities\.$/)
    })

    it('deduplicates provider guidance after higher-priority platform and Publication instructions', () => {
        const capability = toolCapability()
        capability.descriptorSnapshot.providerInstructions = 'Use indexed resources before search.'
        const duplicate = toolCapability()
        duplicate.descriptorSnapshot.providerInstructions = 'Use indexed resources before search.'
        const providerInstructions = mcpCapabilityProviderInstructions([capability, duplicate])
        const instructions = mcpPublicationInstructions('Only expose approved workspace data.', providerInstructions)

        expect(providerInstructions).toEqual([
            { label: 'third-party', instructions: 'Use indexed resources before search.' }
        ])
        expect(instructions.indexOf('Xpert-managed MCP publication')).toBeLessThan(
            instructions.indexOf('Publication instructions:')
        )
        expect(instructions.indexOf('Publication instructions:')).toBeLessThan(
            instructions.indexOf('Capability provider guidance')
        )
        expect(instructions.match(/Use indexed resources before search\./g)).toHaveLength(1)
    })

    it('caps aggregate provider guidance without truncating higher-priority instructions first', () => {
        const instructions = mcpPublicationInstructions('Administrator guidance.', [
            { label: 'provider-a', instructions: 'a'.repeat(8_000) },
            { label: 'provider-b', instructions: 'b'.repeat(8_000) }
        ])

        expect([...instructions]).toHaveLength(16_000)
        expect(instructions).toContain('Publication instructions:\nAdministrator guidance.')
        expect(instructions).toContain('[provider-a]')
        expect(instructions).toContain('[Provider guidance truncated by Xpert.]')
    })

    it('limits change subscriptions to capabilities visible to the authenticated principal', () => {
        expect(
            authorizedSubscriptionNotifications(
                {
                    toolsListChanged: true,
                    promptsListChanged: true,
                    resourcesListChanged: true,
                    resourceSubscriptions: [
                        'https://resources.example/report',
                        'https://resources.example/private',
                        'file:///etc/passwd'
                    ],
                    taskIds: ['task-1']
                },
                [toolCapability(), resourceCapability()]
            )
        ).toEqual({
            toolsListChanged: true,
            resourcesListChanged: true,
            resourceSubscriptions: ['https://resources.example/report'],
            taskIds: ['task-1']
        })
    })
})
