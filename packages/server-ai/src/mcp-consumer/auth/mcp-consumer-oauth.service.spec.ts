import type { ObjectLiteral, Repository } from 'typeorm'
import { MCPServerType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { McpConsumerOAuthCredential } from './mcp-consumer-oauth-credential.entity'
import { McpConsumerOAuthSession } from './mcp-consumer-oauth-session.entity'
import { McpConsumerOAuthService } from './mcp-consumer-oauth.service'
import { resolveMcpConsumerAuthProvider } from './mcp-consumer-auth.registry'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import type { XpertWorkspaceAccessService } from '../../xpert-workspace'

describe('McpConsumerOAuthService', () => {
    afterEach(() => jest.restoreAllMocks())

    it('encrypts tokens, preserves refresh tokens, and resolves a user-bound runtime provider', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        const credentials = memoryRepository<McpConsumerOAuthCredential>()
        const sessions = memoryRepository<McpConsumerOAuthSession>()
        const toolsets = memoryRepository<XpertToolset>([
            {
                id: 'toolset-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: 'workspace-1',
                name: 'Generic MCP',
                type: 'mcp',
                schema: JSON.stringify({
                    servers: {
                        generic: {
                            type: 'http',
                            url: 'https://mcp.example.test/rpc',
                            auth: { type: 'oauth', binding: 'user', scopes: ['tools:read'] }
                        }
                    }
                })
            } as XpertToolset
        ])
        const workspaceAccess = {
            assertCanRead: jest.fn().mockResolvedValue(undefined),
            assertCanManage: jest.fn().mockResolvedValue(undefined)
        } as unknown as XpertWorkspaceAccessService
        const service = new McpConsumerOAuthService(
            credentials.repository,
            sessions.repository,
            toolsets.repository,
            workspaceAccess
        )
        const session = sessions.repository.create({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            toolsetId: 'toolset-1',
            serverName: 'generic',
            subjectType: 'user',
            subjectId: 'user-1',
            userId: 'user-1',
            serverUrl: 'https://mcp.example.test/rpc',
            redirectUri: 'https://xpert.example.test/api/xpert-toolset/mcp-consumer/oauth/callback',
            stateHash: 'state',
            expiresAt: new Date(Date.now() + 60_000)
        })

        await service.saveClientInformation({
            session,
            subject: { type: 'user', id: 'user-1' },
            clientInformation: {
                client_id: 'client-1',
                redirect_uris: [session.redirectUri]
            }
        })
        await service.saveTokens({
            session,
            subject: { type: 'user', id: 'user-1' },
            tokens: {
                access_token: 'access-secret-1',
                refresh_token: 'refresh-secret-1',
                token_type: 'Bearer',
                expires_in: 3600
            }
        })
        await service.saveTokens({
            session,
            subject: { type: 'user', id: 'user-1' },
            tokens: {
                access_token: 'access-secret-2',
                token_type: 'Bearer',
                expires_in: 3600
            }
        })

        const saved = credentials.items[0]
        expect(saved.credentialCiphertext).toEqual(expect.any(String))
        expect(saved.credentialCiphertext).not.toContain('access-secret-2')
        await expect(service.tokens('toolset-1', 'generic', { type: 'user', id: 'user-1' })).resolves.toEqual(
            expect.objectContaining({
                access_token: 'access-secret-2',
                refresh_token: 'refresh-secret-1'
            })
        )

        service.onModuleInit()
        const provider = await resolveMcpConsumerAuthProvider({
            toolset: toolsets.items[0],
            serverName: 'generic',
            server: {
                type: MCPServerType.HTTP,
                url: 'https://mcp.example.test/rpc',
                auth: { type: 'oauth', binding: 'user', scopes: ['tools:read'] }
            },
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1'
        })
        await expect(provider?.tokens()).resolves.toEqual(expect.objectContaining({ access_token: 'access-secret-2' }))
        service.onModuleDestroy()
    })

    it('stores the PKCE verifier encrypted and consumes it after callback use', async () => {
        const credentials = memoryRepository<McpConsumerOAuthCredential>()
        const sessions = memoryRepository<McpConsumerOAuthSession>()
        const service = new McpConsumerOAuthService(
            credentials.repository,
            sessions.repository,
            memoryRepository<XpertToolset>().repository,
            { assertCanRead: jest.fn(), assertCanManage: jest.fn() } as unknown as XpertWorkspaceAccessService
        )
        const session = await sessions.repository.save(
            sessions.repository.create({
                tenantId: 'tenant-1',
                workspaceId: 'workspace-1',
                toolsetId: 'toolset-1',
                serverName: 'generic',
                subjectType: 'user',
                subjectId: 'user-1',
                userId: 'user-1',
                serverUrl: 'https://mcp.example.test/rpc',
                redirectUri: 'https://xpert.example.test/callback',
                stateHash: 'state',
                expiresAt: new Date(Date.now() + 60_000)
            })
        )

        await service.saveCodeVerifier(session, 'pkce-plain-secret')
        expect(session.codeVerifierCiphertext).not.toContain('pkce-plain-secret')
        await expect(service.codeVerifier(session)).resolves.toBe('pkce-plain-secret')
    })
})

function memoryRepository<TEntity extends ObjectLiteral>(initial: TEntity[] = []) {
    const items = [...initial]
    let nextId = items.length + 1
    const repository = {
        create(input: Partial<TEntity>) {
            return input as TEntity
        },
        async save(entity: TEntity) {
            if (!Reflect.get(entity, 'id')) Reflect.set(entity, 'id', `entity-${nextId++}`)
            if (!Reflect.get(entity, 'createdAt')) Reflect.set(entity, 'createdAt', new Date())
            Reflect.set(entity, 'updatedAt', new Date())
            if (!items.includes(entity)) items.push(entity)
            return entity
        },
        async findOne(options: { where?: object; order?: object }) {
            const matches = items.filter((item) => matchesWhere(item, options.where))
            return matches.at(-1) ?? null
        },
        async find(options: { where?: object }) {
            return items.filter((item) => matchesWhere(item, options.where))
        },
        async delete(where: object) {
            for (let index = items.length - 1; index >= 0; index -= 1) {
                if (matchesWhere(items[index], where)) items.splice(index, 1)
            }
            return { affected: 1, raw: [] }
        },
        createQueryBuilder() {
            const filters: object[] = []
            const builder = {
                addSelect: () => builder,
                where: (_query: string, values: object) => {
                    filters.push(values)
                    return builder
                },
                andWhere: (_query: string, values: object) => {
                    filters.push(values)
                    return builder
                },
                getOne: async () => items.find((item) => filters.every((filter) => matchesWhere(item, filter))) ?? null
            }
            return builder
        }
    } as unknown as Repository<TEntity>
    return { items, repository }
}

function matchesWhere(value: object, where?: object) {
    if (!where) return true
    return Object.keys(where).every((key) => Reflect.get(value, key) === Reflect.get(where, key))
}
