import { User } from '@xpert-ai/server-core'
import { BadRequestException, UnauthorizedException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { McpOAuthPolicy, McpPublication } from './entities'
import { McpOAuthService } from './mcp-oauth.service'
import { McpPublicationService } from './mcp-publication.service'
import { McpSubscriptionService } from './mcp-subscription.service'

describe('McpOAuthService', () => {
    const issuer = 'http://localhost'
    const originalFetch = global.fetch
    let privateKey: CryptoKey
    let service: McpOAuthService
    let policy: McpOAuthPolicy
    let user: User
    let introspectionActive = true
    let savePolicy: jest.Mock
    let publishAccessInvalidated: jest.Mock

    beforeAll(async () => {
        const jose = await import('jose')
        const keyPair = await jose.generateKeyPair('RS256')
        privateKey = keyPair.privateKey
        const publicJwk = await jose.exportJWK(keyPair.publicKey)
        Object.assign(publicJwk, { alg: 'RS256', kid: 'mcp-test-key', use: 'sig' })

        global.fetch = jest.fn(async (input: string | URL | Request) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
            if (url === `${issuer}/.well-known/openid-configuration`) {
                return Response.json({
                    issuer,
                    jwks_uri: `${issuer}/jwks`,
                    authorization_endpoint: `${issuer}/authorize`,
                    token_endpoint: `${issuer}/token`,
                    introspection_endpoint: `${issuer}/introspect`,
                    scopes_supported: ['tools:list', 'tools:call']
                })
            }
            if (url === `${issuer}/jwks`) return Response.json({ keys: [publicJwk] })
            if (url === `${issuer}/introspect`) {
                return Response.json({
                    active: introspectionActive,
                    sub: 'external-subject',
                    client_id: 'codex-client',
                    scope: 'tools:list tools:call'
                })
            }
            return Response.json({}, { status: 404 })
        })
    }, 30_000)

    afterAll(() => {
        global.fetch = originalFetch
    })

    beforeEach(() => {
        introspectionActive = true
        policy = Object.assign(new McpOAuthPolicy(), {
            id: '30000000-0000-4000-8000-000000000001',
            publicationId: publication().id,
            tenantId: publication().tenantId,
            organizationId: publication().organizationId,
            issuer,
            audience: 'xpert-mcp',
            requiredScopes: ['tools:list'],
            subjectMapping: { subjectClaim: 'sub', emailClaim: 'email', clientIdClaim: 'azp' },
            introspectionEnabled: false,
            introspectionClientSecretConfigured: false,
            enabled: true
        })
        user = Object.assign(new User(), {
            id: '30000000-0000-4000-8000-000000000002',
            tenantId: publication().tenantId,
            email: 'mcp@example.com',
            thirdPartyId: 'external-subject'
        })
        savePolicy = jest.fn(async (value) => value)
        const policyRepository = {
            findOne: jest.fn().mockImplementation(async () => policy),
            createQueryBuilder: jest.fn(() => runtimePolicyBuilder(() => policy)),
            create: jest.fn((value) => Object.assign(new McpOAuthPolicy(), value)),
            save: savePolicy
        } as unknown as Repository<McpOAuthPolicy>
        const userRepository = {
            findOne: jest.fn().mockResolvedValue(user)
        } as unknown as Repository<User>
        publishAccessInvalidated = jest.fn()
        service = new McpOAuthService(
            policyRepository,
            userRepository,
            {
                getManaged: jest.fn().mockResolvedValue(publication())
            } as unknown as McpPublicationService,
            { publishAccessInvalidated } as unknown as McpSubscriptionService
        )
    })

    it('validates a signed token and maps its subject without exposing the token', async () => {
        const token = await signToken({ issuer, audience: 'xpert-mcp', scope: 'tools:list tools:call' })

        const principal = await service.authenticate(publication(), token)

        expect(principal).toEqual({
            authMethod: 'oauth',
            subjectType: 'user',
            subjectId: user.id,
            userId: user.id,
            clientId: 'codex-client',
            tenantId: publication().tenantId,
            organizationId: publication().organizationId,
            publicationId: publication().id,
            scopes: ['tools:list', 'tools:call']
        })
        expect(principal).not.toHaveProperty('token')
        expect(principal).not.toHaveProperty('authorization')
        expect(global.fetch).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: 'manual' }))
    })

    it.each([
        ['issuer', { issuer: `${issuer}/wrong`, audience: 'xpert-mcp', scope: 'tools:list' }],
        ['audience', { issuer, audience: 'another-resource', scope: 'tools:list' }],
        ['scope', { issuer, audience: 'xpert-mcp', scope: 'prompts:list' }]
    ])('rejects a token with an invalid %s', async (_label, claims) => {
        const token = await signToken(claims)

        await expect(service.authenticate(publication(), token)).rejects.toBeInstanceOf(UnauthorizedException)
    })

    it('fails closed as soon as the authorization server reports a token revoked', async () => {
        policy.introspectionEnabled = true
        const token = await signToken({ issuer, audience: 'xpert-mcp', scope: 'tools:list tools:call' })

        await expect(service.authenticate(publication(), token)).resolves.toEqual(
            expect.objectContaining({ subjectId: user.id, clientId: 'codex-client' })
        )
        introspectionActive = false

        await expect(service.authenticate(publication(), token)).rejects.toBeInstanceOf(UnauthorizedException)
        const introspectionCalls = jest
            .mocked(global.fetch)
            .mock.calls.filter(([input]) => input.toString() === `${issuer}/introspect`)
        expect(introspectionCalls).toHaveLength(2)
        expect(introspectionCalls[0]?.[1]).toEqual(expect.objectContaining({ method: 'POST', redirect: 'manual' }))
    })

    it('encrypts introspection credentials and never returns the stored ciphertext', async () => {
        const saved = await service.upsert(publication().id, {
            issuer,
            audience: 'xpert-mcp',
            requiredScopes: ['tools:list'],
            introspection: {
                enabled: true,
                clientId: 'resource-server',
                clientSecret: 'super-secret'
            }
        })

        expect(saved).toMatchObject({
            introspectionEnabled: true,
            introspectionClientId: 'resource-server',
            introspectionClientSecretConfigured: true
        })
        expect(saved).not.toHaveProperty('introspectionClientSecretEncrypted')
        expect(savePolicy.mock.calls[0]?.[0].introspectionClientSecretEncrypted).toEqual(expect.any(String))
        expect(savePolicy.mock.calls[0]?.[0].introspectionClientSecretEncrypted).not.toContain('super-secret')
        expect(publishAccessInvalidated).toHaveBeenCalledWith(publication().id)
    })

    it('publishes protected resource metadata and the matching challenge', async () => {
        await expect(
            service.protectedResourceMetadata(publication(), 'https://xpert.test/api/mcp/p/test')
        ).resolves.toEqual({
            resource: 'https://xpert.test/api/mcp/p/test',
            authorization_servers: [issuer],
            bearer_methods_supported: ['header'],
            scopes_supported: ['tools:list']
        })
        await expect(
            service.challenge(publication(), 'https://xpert.test/.well-known/oauth-protected-resource/api/mcp/p/test')
        ).resolves.toBe(
            `Bearer resource_metadata="https://xpert.test/.well-known/oauth-protected-resource/api/mcp/p/test", scope="tools:list"`
        )
    })

    it('rejects production loopback issuers before making a discovery request', async () => {
        const originalNodeEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'production'
        jest.mocked(global.fetch).mockClear()
        try {
            await expect(service.test(publication().id)).rejects.toBeInstanceOf(BadRequestException)
            expect(global.fetch).not.toHaveBeenCalled()
        } finally {
            if (originalNodeEnv === undefined) delete process.env.NODE_ENV
            else process.env.NODE_ENV = originalNodeEnv
        }
    })

    it('does not follow OAuth discovery redirects', async () => {
        global.fetch = jest.fn(async () => Response.redirect('https://authorization.example.test/metadata', 302))

        await expect(service.test(publication().id)).rejects.toBeInstanceOf(BadRequestException)
        expect(global.fetch).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: 'manual' }))
    })

    async function signToken(input: { issuer: string; audience: string; scope: string }) {
        const jose = await import('jose')
        return new jose.SignJWT({
            scope: input.scope,
            email: user.email,
            azp: 'codex-client'
        })
            .setProtectedHeader({ alg: 'RS256', kid: 'mcp-test-key' })
            .setIssuer(input.issuer)
            .setAudience(input.audience)
            .setSubject('external-subject')
            .setIssuedAt()
            .setExpirationTime('5m')
            .sign(privateKey)
    }
})

function publication() {
    return Object.assign(new McpPublication(), {
        id: '20000000-0000-4000-8000-000000000001',
        tenantId: '20000000-0000-4000-8000-000000000002',
        organizationId: '20000000-0000-4000-8000-000000000003',
        slug: 'test',
        authMethods: ['oauth']
    })
}

function runtimePolicyBuilder(value: () => McpOAuthPolicy) {
    const builder = {
        addSelect: jest.fn(),
        where: jest.fn(),
        andWhere: jest.fn(),
        getOne: jest.fn(async () => value())
    }
    builder.addSelect.mockReturnValue(builder)
    builder.where.mockReturnValue(builder)
    builder.andWhere.mockReturnValue(builder)
    return builder
}
