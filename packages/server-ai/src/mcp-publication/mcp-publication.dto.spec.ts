import { BadRequestException, ValidationPipe } from '@nestjs/common'
import {
    CreateMcpApiKeyInput,
    CreateMcpPublicationInput,
    McpCapabilityBindingInput,
    UpsertMcpOAuthPolicyInput
} from './mcp-publication.dto'

describe('MCP Publication management DTOs', () => {
    const pipe = new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true })
    type DtoConstructor = new () => object

    it('accepts a bounded capability policy and materializes its nested DTOs', async () => {
        await expect(
            transform(McpCapabilityBindingInput, {
                toolsetId: '10000000-0000-4000-8000-000000000001',
                capabilityType: 'tool',
                capabilityKey: 'search',
                publicName: 'generic_search',
                enabled: true,
                policy: {
                    approvalMode: 'allow',
                    timeoutMs: 5_000,
                    rateLimit: { requests: 20, windowSeconds: 60 }
                }
            })
        ).resolves.toEqual(
            expect.objectContaining({
                policy: expect.objectContaining({
                    timeoutMs: 5_000,
                    rateLimit: { requests: 20, windowSeconds: 60 }
                })
            })
        )
    })

    const invalidInputs: Array<[DtoConstructor, unknown]> = [
        [
            McpCapabilityBindingInput,
            {
                toolsetId: '10000000-0000-4000-8000-000000000001',
                capabilityType: 'tool',
                capabilityKey: 'search',
                publicName: 'generic_search',
                policy: { timeoutMs: -1, rateLimit: { requests: 0, windowSeconds: 0 } }
            }
        ],
        [CreateMcpApiKeyInput, { name: 'Codex', subjectType: 'service_account', subjectId: 'not-a-uuid' }],
        [CreateMcpPublicationInput, { name: 'MCP', slug: 'Invalid Slug', unexpected: true }],
        [
            UpsertMcpOAuthPolicyInput,
            {
                issuer: 'https://issuer.example.com',
                audience: 'xpert',
                subjectMapping: { subjectClaim: 'sub', emailClaim: 'bad claim name' }
            }
        ]
    ]

    it.each(invalidInputs)('rejects malformed or unbounded management input', async (metatype, value) => {
        await expect(transform(metatype, value)).rejects.toBeInstanceOf(BadRequestException)
    })

    function transform<T extends object>(metatype: new () => T, value: unknown) {
        return pipe.transform(value, { metatype, type: 'body' }) as Promise<T>
    }
})
