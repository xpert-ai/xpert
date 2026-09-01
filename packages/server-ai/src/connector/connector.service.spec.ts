import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { PARAMTYPES_METADATA, SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants'
import { ModuleRef } from '@nestjs/core'
import { RequestContext, encryptSecret } from '@xpert-ai/server-core'
import { environment } from '@xpert-ai/server-config'
import type { ConnectorStrategyRuntime } from '@xpert-ai/plugin-sdk'
import { FindOperator, type FindOptionsWhere } from 'typeorm'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { ConnectorOAuthSession } from './connector-oauth-session.entity'
import { ConnectorPersonalAccount } from './connector-personal-account.entity'
import { ConnectorPersonalGrant } from './connector-personal-grant.entity'
import { ConnectorRuntimeAudit } from './connector-runtime-audit.entity'
import { Connector } from './connector.entity'
import { ConnectorService } from './connector.service'

describe('ConnectorService', () => {
    let connectors: InMemoryRepository<Connector>
    let sessions: InMemoryRepository<ConnectorOAuthSession>
    let personalAccounts: InMemoryRepository<ConnectorPersonalAccount>
    let personalGrants: InMemoryRepository<ConnectorPersonalGrant>
    let runtimeAudits: InMemoryRepository<ConnectorRuntimeAudit>
    let service: ConnectorService
    let strategy: ConnectorStrategyRuntime
    let currentUserId: string
    let publishedXpertAccess: { getAccessiblePublishedXpert: jest.Mock }
    let projectAccess: {
        assertCanUse: jest.Mock
        assertCanManage: jest.Mock
        assertCanUseXpert: jest.Mock
    }

    beforeEach(() => {
        connectors = new InMemoryRepository<Connector>()
        sessions = new InMemoryRepository<ConnectorOAuthSession>()
        personalAccounts = new InMemoryRepository<ConnectorPersonalAccount>()
        personalGrants = new InMemoryRepository<ConnectorPersonalGrant>()
        runtimeAudits = new InMemoryRepository<ConnectorRuntimeAudit>()
        currentUserId = 'user-1'
        strategy = {
            definition: {
                provider: 'example',
                label: 'Example Connector',
                appCredentials: {
                    fields: [
                        {
                            name: 'appId',
                            label: 'App ID'
                        },
                        {
                            name: 'appSecret',
                            label: 'App Secret',
                            secret: true
                        }
                    ],
                    defaultValues: {
                        region: 'test'
                    }
                },
                auth: { type: 'oauth2' }
            },
            buildAuthorizationUrl: jest.fn().mockResolvedValue({
                authorizationUrl: 'https://oauth.example.com/authorize?state=state-1',
                scopes: ['docs:doc:read']
            }),
            exchangeOAuthCode: jest.fn().mockResolvedValue({
                appId: 'example_app_id',
                accessToken: 'uat_secret',
                refreshToken: 'urt_secret',
                expiresAt: futureIsoDate(1),
                refreshExpiresAt: futureIsoDate(7),
                scopes: ['docs:doc:read'],
                profile: { openId: 'ou_1', name: 'Ada' }
            })
        }

        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockImplementation(() => currentUserId)

        publishedXpertAccess = {
            getAccessiblePublishedXpert: jest.fn().mockResolvedValue({
                id: 'xpert-1',
                workspaceId: 'workspace-1'
            })
        }
        projectAccess = {
            assertCanUse: jest.fn().mockResolvedValue({
                project: { id: 'project-1', organizationId: 'org-1' },
                role: 'member'
            }),
            assertCanManage: jest.fn().mockResolvedValue({
                project: { id: 'project-1', organizationId: 'org-1' },
                role: 'manager'
            }),
            assertCanUseXpert: jest.fn().mockResolvedValue({
                project: { id: 'project-1', organizationId: 'org-1' },
                role: 'member'
            })
        }
        const moduleRef = {
            get: jest.fn((token: unknown) => {
                if (token === PublishedXpertAccessService) {
                    return publishedXpertAccess
                }
                if (token === XpertProjectAccessService) {
                    return projectAccess
                }
                return undefined
            })
        } as unknown as ModuleRef

        service = new ConnectorService(
            connectors,
            sessions,
            {
                assertCanRead: jest.fn().mockResolvedValue({
                    workspace: {
                        id: 'workspace-1',
                        organizationId: 'org-1',
                        ownerId: 'user-1',
                        members: []
                    }
                }),
                assertCanManage: jest.fn().mockResolvedValue({
                    workspace: { id: 'workspace-1', organizationId: 'org-1' }
                }),
                assertCanRun: jest.fn()
            },
            {
                getRuntime: jest.fn().mockReturnValue(strategy),
                listRuntime: jest.fn().mockReturnValue([strategy])
            },
            personalAccounts,
            personalGrants,
            runtimeAudits,
            moduleRef
        )
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('rejects legacy app integration ids instead of resolving system integrations', async () => {
        const input = {
            appIntegrationId: 'integration-1',
            redirectUri: 'https://xpert.test/api/connector/oauth/callback'
        }

        await expect(service.startOAuth('workspace-1', 'example', input)).rejects.toBeInstanceOf(BadRequestException)

        expect(strategy.buildAuthorizationUrl).not.toHaveBeenCalled()
    })

    it('removes Project bindings, grants, and OAuth sessions while preserving runtime audit', async () => {
        strategy.revokeCredential = jest.fn()
        const binding = await connectors.save({
            id: 'project-binding-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            scopeType: 'project',
            projectId: 'project-1',
            workspaceId: null,
            provider: 'example',
            authorizationMode: 'personal',
            status: 'active'
        } as Connector)
        await connectors.save({
            id: 'workspace-binding-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            scopeType: 'workspace',
            workspaceId: 'workspace-1',
            projectId: null,
            provider: 'example',
            authorizationMode: 'shared',
            status: 'active'
        } as Connector)
        await sessions.save({
            id: 'session-1',
            tenantId: 'tenant-1',
            connectorId: binding.id,
            stateHash: 'state-hash',
            scopeType: 'project',
            projectId: 'project-1',
            workspaceId: null,
            authorizationMode: 'personal',
            provider: 'example',
            redirectUri: 'https://xpert.test/api/connector/oauth/callback',
            expiresAt: new Date(Date.now() + 60_000)
        } as ConnectorOAuthSession)
        await personalGrants.save({
            id: 'grant-1',
            tenantId: 'tenant-1',
            connectorId: binding.id,
            accountId: 'account-1',
            userId: 'user-1',
            grantedAt: new Date()
        } as ConnectorPersonalGrant)
        const personalAccount = await personalAccounts.save({
            id: 'account-1',
            tenantId: 'tenant-1',
            userId: 'user-1',
            provider: 'example',
            status: 'active',
            credentialCiphertext: 'personal-account-ciphertext'
        } as ConnectorPersonalAccount)
        await runtimeAudits.save({
            id: 'audit-1',
            tenantId: 'tenant-1',
            connectorId: binding.id,
            provider: 'example',
            scopeType: 'project',
            authorizationMode: 'personal',
            projectId: 'project-1',
            outcome: 'resolved'
        } as ConnectorRuntimeAudit)

        await service.deleteProjectBindings({ projectId: 'project-1', tenantId: 'tenant-1' })

        expect(connectors.items.map((item) => item.id)).toEqual(['workspace-binding-1'])
        expect(sessions.items).toHaveLength(0)
        expect(personalGrants.items).toHaveLength(0)
        expect(personalAccounts.items).toEqual([personalAccount])
        expect(runtimeAudits.items).toHaveLength(1)
        expect(strategy.revokeCredential).not.toHaveBeenCalled()
    })

    it('revokes a shared provider credential before deleting its Binding locally', async () => {
        const start = await service.startOAuth('workspace-1', 'example', {
            app: connectorApp(),
            redirectUri: 'https://xpert.test/api/connector/oauth/callback'
        })
        const state = (strategy.buildAuthorizationUrl as jest.Mock).mock.calls[0][0].state
        await service.completeOAuthCallback({ state, code: 'code-1' })
        strategy.revokeCredential = jest.fn().mockResolvedValue(undefined)

        await service.deleteBinding(start.connector.id)

        expect(strategy.revokeCredential).toHaveBeenCalledWith({
            authMethodId: 'oauth2',
            credential: expect.objectContaining({ data: expect.objectContaining({ accessToken: 'uat_secret' }) }),
            reason: 'delete'
        })
        expect(connectors.items).toHaveLength(0)
    })

    it('activates a connector without exposing encrypted or plaintext credentials', async () => {
        const start = await service.startOAuth('workspace-1', 'example', {
            app: connectorApp(),
            redirectUri: 'https://xpert.test/api/connector/oauth/callback'
        })

        expect(start.authorizationUrl).toContain('state=state-1')
        expect(start.connector.status).toBe('pending')
        expect(start.connector).not.toHaveProperty('credentialCiphertext')

        const state = (strategy.buildAuthorizationUrl as jest.Mock).mock.calls[0][0].state
        expect(sessions.items[0]).not.toHaveProperty('state')
        expect(sessions.items[0].stateHash).toBeTruthy()
        await expect(service.getOAuthCallbackContext(state)).resolves.toEqual({
            connectorId: start.connector.id,
            scope: { type: 'workspace', workspaceId: 'workspace-1' },
            workspaceId: 'workspace-1'
        })
        const browserBinding = service.createOAuthBrowserBinding(state)
        expect(() => service.assertOAuthBrowserBinding(state, browserBinding)).not.toThrow()
        expect(() => service.assertOAuthBrowserBinding('another-state', browserBinding)).toThrow(BadRequestException)
        expect(() => service.assertOAuthBrowserBinding(state, 'forwarded-browser')).toThrow(BadRequestException)
        const activated = await service.completeOAuthCallback({ state, code: 'code-1' })

        expect(activated.status).toBe('active')
        expect(activated.profile).toEqual({ openId: 'ou_1', name: 'Ada' })
        expect(activated).not.toHaveProperty('credentialCiphertext')
        expect(JSON.stringify(connectors.items[0])).not.toContain('uat_secret')
        expect(JSON.stringify(connectors.items[0])).not.toContain('urt_secret')

        connectors.items[0].authMethodId = null
        const runtime = await service.getRuntimeConnector({
            workspaceId: 'workspace-1',
            provider: 'example',
            connectorId: activated.id
        })

        expect(runtime).toEqual(
            expect.objectContaining({
                connectorId: activated.id,
                workspaceId: 'workspace-1',
                provider: 'example',
                appId: 'example_app_id',
                accessToken: 'uat_secret'
            })
        )
        await expect(
            service.getRuntimeConnectorCredential({
                workspaceId: 'workspace-1',
                provider: 'example',
                connectorId: activated.id
            })
        ).resolves.toEqual(
            expect.objectContaining({
                authMethodId: 'oauth2',
                credentials: expect.objectContaining({ accessToken: 'uat_secret' })
            })
        )
    })

    it('clears stale credentials and invalidates previous pending sessions when reconnecting', async () => {
        const initialStart = await service.startOAuth('workspace-1', 'example', {
            app: connectorApp(),
            redirectUri: 'https://xpert.test/api/connector/oauth/callback'
        })
        const initialState = (strategy.buildAuthorizationUrl as jest.Mock).mock.calls[0][0].state
        const activated = await service.completeOAuthCallback({ state: initialState, code: 'code-1' })

        expect(activated.status).toBe('active')
        expect(connectors.items[0].credentialCiphertext).toBeTruthy()
        expect(connectors.items[0].profile).toEqual({ openId: 'ou_1', name: 'Ada' })
        strategy.revokeCredential = jest.fn().mockResolvedValue(undefined)

        const firstReconnect = await service.startOAuth('workspace-1', 'example', {
            app: connectorApp(),
            redirectUri: 'https://xpert.test/api/connector/oauth/callback'
        })
        const firstReconnectState = (strategy.buildAuthorizationUrl as jest.Mock).mock.calls[1][0].state

        expect(firstReconnect.connector.id).toBe(initialStart.connector.id)
        expect(firstReconnect.connector).toEqual(
            expect.objectContaining({
                status: 'pending',
                profile: null,
                scopes: undefined,
                expiresAt: null,
                refreshExpiresAt: null,
                connectedAt: null,
                disconnectedAt: null
            })
        )
        expect(connectors.items[0].credentialCiphertext).toBeNull()
        expect(connectors.items[0].profile).toBeNull()
        expect(connectors.items[0].scopes).toBeNull()
        expect(strategy.revokeCredential).toHaveBeenCalledWith({
            authMethodId: 'oauth2',
            credential: expect.objectContaining({ data: expect.objectContaining({ accessToken: 'uat_secret' }) }),
            reason: 'rotate'
        })

        await service.startOAuth('workspace-1', 'example', {
            app: connectorApp(),
            redirectUri: 'https://xpert.test/api/connector/oauth/callback'
        })

        expect(sessions.items[1].consumedAt).toBeInstanceOf(Date)
        await expect(
            service.completeOAuthCallback({ state: firstReconnectState, code: 'code-2' })
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('destroys a shared credential locally when the provider has no revocation hook', async () => {
        const start = await service.startOAuth('workspace-1', 'example', {
            app: connectorApp(),
            redirectUri: 'https://xpert.test/api/connector/oauth/callback'
        })
        const state = (strategy.buildAuthorizationUrl as jest.Mock).mock.calls[0][0].state
        const activated = await service.completeOAuthCallback({ state, code: 'code-1' })

        await service.disconnect('workspace-1', activated.id)
        const [connector] = await service.list('workspace-1')

        expect(connector).toEqual(
            expect.objectContaining({
                id: start.connector.id,
                status: 'disconnected',
                profile: null,
                scopes: undefined,
                expiresAt: null,
                refreshExpiresAt: null,
                lastError: null
            })
        )
        expect(connectors.items[0].credentialCiphertext).toBeNull()
        expect(connectors.items[0].profile).toBeNull()
        expect(connectors.items[0].scopes).toBeNull()
        expect(connectors.items[0].expiresAt).toBeNull()
        expect(connectors.items[0].refreshExpiresAt).toBeNull()
    })

    it('keeps the shared credential when provider revocation fails', async () => {
        const start = await service.startOAuth('workspace-1', 'example', {
            app: connectorApp(),
            redirectUri: 'https://xpert.test/api/connector/oauth/callback'
        })
        const state = (strategy.buildAuthorizationUrl as jest.Mock).mock.calls[0][0].state
        await service.completeOAuthCallback({ state, code: 'code-1' })
        const ciphertext = connectors.items[0].credentialCiphertext
        strategy.revokeCredential = jest.fn().mockRejectedValue(new Error('provider unavailable'))

        await expect(service.disconnect('workspace-1', start.connector.id)).rejects.toBeInstanceOf(BadRequestException)

        expect(connectors.items[0]).toEqual(
            expect.objectContaining({ status: 'active', credentialCiphertext: ciphertext })
        )
    })

    it('invalidates pending OAuth sessions when disconnecting', async () => {
        ;(strategy.buildAuthorizationUrl as jest.Mock).mockResolvedValueOnce({
            authorizationUrl: 'https://oauth.example.com/authorize?state=state-1',
            scopes: ['docs:doc:read'],
            metadata: {
                phase: 'pending',
                appSecret: 'pending_app_secret'
            }
        })
        const start = await service.startOAuth('workspace-1', 'example', {
            app: connectorApp(),
            redirectUri: 'https://xpert.test/api/connector/oauth/callback'
        })
        const state = (strategy.buildAuthorizationUrl as jest.Mock).mock.calls[0][0].state

        await service.disconnect('workspace-1', start.connector.id)

        expect(sessions.items[0].consumedAt).toBeInstanceOf(Date)
        expect(sessions.items[0].metadataCiphertext).toBeNull()
        await expect(service.completeOAuthCallback({ state, code: 'code-1' })).rejects.toBeInstanceOf(
            BadRequestException
        )
        expect(connectors.items[0].status).toBe('disconnected')
    })

    it('cancels pending OAuth sessions and makes the old state unusable', async () => {
        ;(strategy.buildAuthorizationUrl as jest.Mock).mockResolvedValueOnce({
            authorizationUrl: 'https://oauth.example.com/authorize?state=state-1',
            scopes: ['docs:doc:read'],
            metadata: {
                phase: 'pending',
                appSecret: 'pending_app_secret'
            }
        })
        const start = await service.startOAuth('workspace-1', 'example', {
            app: connectorApp(),
            redirectUri: 'https://xpert.test/api/connector/oauth/callback'
        })
        const state = (strategy.buildAuthorizationUrl as jest.Mock).mock.calls[0][0].state

        await service.cancelAuthorization('workspace-1', start.connector.id)

        expect(sessions.items[0].consumedAt).toBeInstanceOf(Date)
        expect(sessions.items[0].metadataCiphertext).toBeNull()
        await expect(service.completeOAuthCallback({ state, code: 'code-1' })).rejects.toBeInstanceOf(
            BadRequestException
        )
        expect(connectors.items[0].status).toBe('disconnected')
    })

    it('rejects cancellation when the connector is already active', async () => {
        const start = await service.startOAuth('workspace-1', 'example', {
            app: connectorApp(),
            redirectUri: 'https://xpert.test/api/connector/oauth/callback'
        })
        const state = (strategy.buildAuthorizationUrl as jest.Mock).mock.calls[0][0].state
        await service.completeOAuthCallback({ state, code: 'code-1' })

        await expect(service.cancelAuthorization('workspace-1', start.connector.id)).rejects.toThrow(
            'Connector authorization is not pending'
        )
    })

    it('does not expose unannotated Object dependencies to Nest injection', () => {
        const paramTypes = ((Reflect as any).getMetadata(PARAMTYPES_METADATA, ConnectorService) ?? []) as unknown[]
        const explicitDeps = ((Reflect as any).getMetadata(SELF_DECLARED_DEPS_METADATA, ConnectorService) ??
            []) as Array<{ index: number }>

        expect(explicitDeps.map((dependency) => dependency.index).sort()).toEqual(paramTypes.map((_, index) => index))
    })

    it('starts connector authorization with connector-owned app credentials', async () => {
        await service.startOAuth('workspace-1', 'example', {
            app: {
                apiKey: 'connector_api_key',
                region: 'user-input'
            },
            redirectUri: 'https://xpert.test/callback'
        })

        expect(strategy.buildAuthorizationUrl).toHaveBeenCalledWith(
            expect.objectContaining({
                app: expect.objectContaining({
                    apiKey: 'connector_api_key',
                    region: 'test'
                })
            })
        )
    })

    it('starts a connector flow without app integration when the strategy manages credentials', async () => {
        strategy.definition = {
            provider: 'managed-example',
            label: 'Managed Example',
            auth: { type: 'oauth2' }
        }
        ;(strategy.buildAuthorizationUrl as jest.Mock).mockResolvedValueOnce({
            authorizationUrl: 'https://oauth.example.com/managed?state=state-1',
            scopes: ['drive:read']
        })

        const start = await service.startOAuth('workspace-1', 'managed-example', {
            redirectUri: 'https://xpert.test/callback'
        })

        expect(start.authorizationUrl).toContain('managed')
        expect(start.connector.status).toBe('pending')
        expect(strategy.buildAuthorizationUrl).toHaveBeenCalledWith(
            expect.objectContaining({
                app: undefined,
                redirectUri: 'https://xpert.test/callback'
            })
        )
    })

    it('starts with default app credentials when no credential fields require user input', async () => {
        strategy.definition = {
            provider: 'managed-example',
            label: 'Managed Example',
            appCredentials: {
                defaultValues: {
                    appId: 'default_app_id',
                    appSecret: 'default_app_secret'
                }
            },
            auth: { type: 'oauth2' }
        }
        ;(strategy.buildAuthorizationUrl as jest.Mock).mockResolvedValueOnce({
            authorizationUrl: 'https://oauth.example.com/managed?state=state-1',
            scopes: ['drive:read']
        })

        const start = await service.startOAuth('workspace-1', 'managed-example', {
            redirectUri: 'https://xpert.test/callback'
        })

        expect(start.authorizationUrl).toContain('managed')
        expect(strategy.buildAuthorizationUrl).toHaveBeenCalledWith(
            expect.objectContaining({
                app: {
                    appId: 'default_app_id',
                    appSecret: 'default_app_secret'
                }
            })
        )
    })

    it('marks the connector error when the strategy cannot start authorization', async () => {
        ;(strategy.buildAuthorizationUrl as jest.Mock).mockRejectedValueOnce(
            new Error('Feishu registration unavailable')
        )

        await expect(
            service.startOAuth('workspace-1', 'example', {
                app: connectorApp(),
                redirectUri: 'https://xpert.test/callback'
            })
        ).rejects.toThrow('Feishu registration unavailable')

        expect(connectors.items).toHaveLength(1)
        expect(connectors.items[0]).toEqual(
            expect.objectContaining({
                status: 'error',
                lastError: 'Feishu registration unavailable',
                credentialCiphertext: null,
                profile: null,
                scopes: null
            })
        )
        expect(sessions.items).toHaveLength(0)
    })

    it('rejects raw app credentials when the connector definition does not declare app credentials', async () => {
        strategy.definition = {
            provider: 'managed-example',
            label: 'Managed Example',
            auth: { type: 'oauth2' }
        }

        await expect(
            service.startOAuth('workspace-1', 'managed-example', {
                app: {
                    appId: 'manual_app_id',
                    appSecret: 'manual_app_secret'
                },
                redirectUri: 'https://xpert.test/callback'
            })
        ).rejects.toBeInstanceOf(BadRequestException)

        expect(strategy.buildAuthorizationUrl).not.toHaveBeenCalled()
    })

    it('rejects legacy app integration ids even when manually submitted', async () => {
        strategy.definition = {
            provider: 'managed-example',
            label: 'Managed Example',
            auth: { type: 'oauth2' }
        }
        const input = {
            appIntegrationId: 'integration-1',
            redirectUri: 'https://xpert.test/callback'
        }

        await expect(service.startOAuth('workspace-1', 'managed-example', input)).rejects.toBeInstanceOf(
            BadRequestException
        )

        expect(strategy.buildAuthorizationUrl).not.toHaveBeenCalled()
    })

    it('rejects credential payloads submitted through the public OAuth callback', async () => {
        strategy.definition = {
            provider: 'managed-example',
            label: 'Managed Example',
            auth: { type: 'oauth2' }
        }
        ;(strategy.buildAuthorizationUrl as jest.Mock).mockResolvedValueOnce({
            authorizationUrl: 'https://accounts.example.com/connector-device-flow',
            scopes: ['resource:read']
        })

        const start = await service.startOAuth('workspace-1', 'managed-example', {
            redirectUri: 'https://xpert.test/callback'
        })
        const state = (strategy.buildAuthorizationUrl as jest.Mock).mock.calls[0][0].state
        const callbackInput = {
            state,
            code: '',
            credential: {
                appId: 'cli_app_id',
                accessToken: 'user_access_token'
            }
        }

        await expect(service.completeOAuthCallback(callbackInput)).rejects.toBeInstanceOf(BadRequestException)
        expect(connectors.items.find((item) => item.id === start.connector.id)?.status).toBe('pending')
        expect(strategy.exchangeOAuthCode).not.toHaveBeenCalled()
    })

    it('rejects a public OAuth callback without a state before hashing it', async () => {
        await expect(service.completeOAuthCallback({ state: '', code: 'oauth-code' })).rejects.toBeInstanceOf(
            BadRequestException
        )
    })

    it('activates a plugin-managed connector from a returned credential without app integration', async () => {
        strategy.definition = {
            provider: 'managed-example',
            label: 'Managed Example',
            auth: { type: 'oauth2' }
        }
        ;(strategy.buildAuthorizationUrl as jest.Mock).mockResolvedValueOnce({
            authorizationUrl: 'https://accounts.example.com/connector-device-flow',
            scopes: ['resource:read']
        })
        strategy.pollAuthorization = jest.fn().mockResolvedValueOnce({
            status: 'complete',
            credential: {
                appId: 'cli_app_id',
                brand: 'example',
                accessToken: 'user_access_token',
                refreshToken: 'refresh_token',
                expiresAt: futureIsoDate(1),
                refreshExpiresAt: futureIsoDate(7),
                scopes: ['resource:read'],
                profile: { openId: 'ou_cli', name: 'Example User' }
            }
        })

        const start = await service.startOAuth('workspace-1', 'managed-example', {
            redirectUri: 'https://xpert.test/callback'
        })
        const completed = await service.authorizationStatus('workspace-1', start.connector.id)
        const activated = completed.connector

        expect(activated).toEqual(
            expect.objectContaining({
                id: start.connector.id,
                status: 'active',
                profile: { openId: 'ou_cli', name: 'Example User' }
            })
        )
        expect(strategy.exchangeOAuthCode).not.toHaveBeenCalled()
        expect(JSON.stringify(connectors.items[0])).not.toContain('user_access_token')

        await expect(
            service.getRuntimeConnector({
                workspaceId: 'workspace-1',
                provider: 'managed-example',
                connectorId: activated.id
            })
        ).resolves.toEqual(
            expect.objectContaining({
                appId: 'cli_app_id',
                brand: 'example',
                accessToken: 'user_access_token'
            })
        )
    })

    it('refreshes plugin-managed connectors with encrypted internal app credentials only', async () => {
        strategy.definition = {
            provider: 'managed-example',
            label: 'Managed Example',
            auth: { type: 'oauth2' }
        }
        ;(strategy.buildAuthorizationUrl as jest.Mock).mockResolvedValueOnce({
            authorizationUrl: 'https://accounts.example.com/connector-device-flow',
            scopes: ['resource:read']
        })
        strategy.pollAuthorization = jest.fn().mockResolvedValueOnce({
            status: 'complete',
            credential: {
                appId: 'cli_app_id',
                brand: 'example',
                app: {
                    appId: 'cli_app_id',
                    appSecret: 'app_secret',
                    brand: 'example'
                },
                accessToken: 'expired_user_access_token',
                refreshToken: 'refresh_token',
                expiresAt: pastIsoDate(),
                refreshExpiresAt: futureIsoDate(7),
                scopes: ['resource:read'],
                profile: { openId: 'ou_cli', name: 'Example User' }
            }
        })
        strategy.refreshCredential = jest.fn().mockResolvedValue({
            appId: 'cli_app_id',
            brand: 'example',
            accessToken: 'new_user_access_token',
            refreshToken: 'new_refresh_token',
            expiresAt: futureIsoDate(1),
            refreshExpiresAt: futureIsoDate(7),
            scopes: ['resource:read']
        })

        await service.startOAuth('workspace-1', 'managed-example', {
            redirectUri: 'https://xpert.test/callback'
        })
        const activated = (await service.authorizationStatus('workspace-1', connectors.items[0].id)).connector

        const runtime = await service.getRuntimeConnector({
            workspaceId: 'workspace-1',
            provider: 'managed-example',
            connectorId: activated.id
        })

        expect(strategy.refreshCredential).toHaveBeenCalledWith({
            app: {
                appId: 'cli_app_id',
                appSecret: 'app_secret',
                brand: 'example'
            },
            refreshToken: 'refresh_token'
        })
        expect(runtime).toEqual(
            expect.objectContaining({
                appId: 'cli_app_id',
                brand: 'example',
                accessToken: 'new_user_access_token'
            })
        )
        expect(runtime).not.toHaveProperty('app')
        expect(JSON.stringify(runtime)).not.toContain('app_secret')

        connectors.items[0].expiresAt = new Date(Date.now() - 60 * 60 * 1_000)
        await service.getRuntimeConnector({
            workspaceId: 'workspace-1',
            provider: 'managed-example',
            connectorId: activated.id
        })

        expect(strategy.refreshCredential).toHaveBeenNthCalledWith(2, {
            app: {
                appId: 'cli_app_id',
                appSecret: 'app_secret',
                brand: 'example'
            },
            refreshToken: 'new_refresh_token'
        })
    })

    it('rejects expired runtime credentials that cannot be refreshed', async () => {
        strategy.definition = {
            provider: 'managed-example',
            label: 'Managed Example',
            auth: { type: 'oauth2' }
        }
        ;(strategy.buildAuthorizationUrl as jest.Mock).mockResolvedValueOnce({
            authorizationUrl: 'https://accounts.example.com/connector-device-flow',
            scopes: ['resource:read']
        })
        strategy.pollAuthorization = jest.fn().mockResolvedValueOnce({
            status: 'complete',
            credential: {
                appId: 'cli_app_id',
                brand: 'example',
                app: {
                    appId: 'cli_app_id',
                    appSecret: 'app_secret',
                    brand: 'example'
                },
                accessToken: 'expired_user_access_token',
                expiresAt: pastIsoDate(),
                scopes: ['resource:read']
            }
        })

        await service.startOAuth('workspace-1', 'managed-example', {
            redirectUri: 'https://xpert.test/callback'
        })
        const activated = (await service.authorizationStatus('workspace-1', connectors.items[0].id)).connector

        await expect(
            service.getRuntimeConnector({
                workspaceId: 'workspace-1',
                provider: 'managed-example',
                connectorId: activated.id
            })
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(connectors.items[0].status).toBe('expired')
        expect(connectors.items[0].lastError).toBe('Connector credential expired and cannot be refreshed')
    })

    it('marks connectors expired when credential refresh fails', async () => {
        strategy.definition = {
            provider: 'managed-example',
            label: 'Managed Example',
            auth: { type: 'oauth2' }
        }
        ;(strategy.buildAuthorizationUrl as jest.Mock).mockResolvedValueOnce({
            authorizationUrl: 'https://accounts.example.com/connector-device-flow',
            scopes: ['resource:read']
        })
        strategy.pollAuthorization = jest.fn().mockResolvedValueOnce({
            status: 'complete',
            credential: {
                appId: 'cli_app_id',
                brand: 'example',
                app: {
                    appId: 'cli_app_id',
                    appSecret: 'app_secret',
                    brand: 'example'
                },
                accessToken: 'expired_user_access_token',
                refreshToken: 'refresh_token',
                expiresAt: pastIsoDate(),
                refreshExpiresAt: futureIsoDate(7),
                scopes: ['resource:read']
            }
        })
        strategy.refreshCredential = jest.fn().mockRejectedValue(new Error('refresh denied'))

        await service.startOAuth('workspace-1', 'managed-example', {
            redirectUri: 'https://xpert.test/callback'
        })
        const activated = (await service.authorizationStatus('workspace-1', connectors.items[0].id)).connector

        await expect(
            service.getRuntimeConnector({
                workspaceId: 'workspace-1',
                provider: 'managed-example',
                connectorId: activated.id
            })
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(connectors.items[0].status).toBe('expired')
        expect(connectors.items[0].lastError).toBe('Connector credential refresh failed: refresh denied')
    })

    it('rejects runtime credentials when the refresh token has expired', async () => {
        strategy.definition = {
            provider: 'managed-example',
            label: 'Managed Example',
            auth: { type: 'oauth2' }
        }
        ;(strategy.buildAuthorizationUrl as jest.Mock).mockResolvedValueOnce({
            authorizationUrl: 'https://accounts.example.com/connector-device-flow',
            scopes: ['resource:read']
        })
        strategy.pollAuthorization = jest.fn().mockResolvedValueOnce({
            status: 'complete',
            credential: {
                appId: 'cli_app_id',
                brand: 'example',
                app: {
                    appId: 'cli_app_id',
                    appSecret: 'app_secret',
                    brand: 'example'
                },
                accessToken: 'expired_user_access_token',
                refreshToken: 'expired_refresh_token',
                expiresAt: pastIsoDate(),
                refreshExpiresAt: pastIsoDate(),
                scopes: ['resource:read']
            }
        })
        strategy.refreshCredential = jest.fn()

        await service.startOAuth('workspace-1', 'managed-example', {
            redirectUri: 'https://xpert.test/callback'
        })
        const activated = (await service.authorizationStatus('workspace-1', connectors.items[0].id)).connector

        await expect(
            service.getRuntimeConnector({
                workspaceId: 'workspace-1',
                provider: 'managed-example',
                connectorId: activated.id
            })
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(strategy.refreshCredential).not.toHaveBeenCalled()
        expect(connectors.items[0].status).toBe('expired')
        expect(connectors.items[0].lastError).toBe('Connector refresh token has expired')
    })

    it('polls plugin-managed authorization and activates the connector without exposing metadata secrets', async () => {
        strategy.definition = {
            provider: 'managed-example',
            label: 'Managed Example',
            auth: { type: 'oauth2' }
        }
        ;(strategy.buildAuthorizationUrl as jest.Mock).mockResolvedValueOnce({
            authorizationUrl: 'https://accounts.example.com/page/connector?user_code=app',
            scopes: ['resource:read'],
            pollIntervalSeconds: 5,
            metadata: {
                phase: 'app_registration',
                deviceCode: 'app-device-code',
                appSecret: 'transient_app_secret'
            }
        })
        strategy.pollAuthorization = jest
            .fn()
            .mockResolvedValueOnce({
                status: 'pending',
                authorizationUrl: 'https://accounts.example.com/page/connector?user_code=user',
                pollIntervalSeconds: 5,
                metadata: {
                    phase: 'user_authorization',
                    deviceCode: 'user-device-code',
                    appId: 'cli_app_id',
                    appSecret: 'transient_app_secret'
                }
            })
            .mockResolvedValueOnce({
                status: 'complete',
                credential: {
                    appId: 'cli_app_id',
                    brand: 'example',
                    app: {
                        appId: 'cli_app_id',
                        appSecret: 'transient_app_secret',
                        brand: 'example'
                    },
                    accessToken: 'user_access_token',
                    refreshToken: 'refresh_token',
                    expiresAt: futureIsoDate(1),
                    refreshExpiresAt: futureIsoDate(7),
                    scopes: ['resource:read'],
                    profile: { openId: 'ou_cli', name: 'Example User' }
                }
            })

        const start = await service.startOAuth('workspace-1', 'managed-example', {
            redirectUri: 'https://xpert.test/callback'
        })

        expect(start.pollIntervalSeconds).toBe(5)
        expect(JSON.stringify(sessions.items[0])).not.toContain('transient_app_secret')
        const pending = await service.authorizationStatus('workspace-1', start.connector.id)
        expect(pending).toEqual(
            expect.objectContaining({
                authorizationUrl: 'https://accounts.example.com/page/connector?user_code=user',
                pollIntervalSeconds: 5
            })
        )
        expect(strategy.pollAuthorization).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    phase: 'app_registration',
                    deviceCode: 'app-device-code',
                    appSecret: 'transient_app_secret'
                })
            })
        )
        expect(JSON.stringify(sessions.items[0])).not.toContain('transient_app_secret')

        const completed = await service.authorizationStatus('workspace-1', start.connector.id)
        expect(completed.connector).toEqual(
            expect.objectContaining({
                status: 'active',
                profile: { openId: 'ou_cli', name: 'Example User' }
            })
        )
        expect(JSON.stringify(connectors.items[0])).not.toContain('user_access_token')
        expect(JSON.stringify(sessions.items[0])).not.toContain('transient_app_secret')
        expect(sessions.items[0].metadataCiphertext).toBeNull()

        strategy.refreshCredential = jest.fn().mockResolvedValue({
            appId: 'cli_app_id',
            brand: 'example',
            accessToken: 'refreshed_user_access_token',
            refreshToken: 'refreshed_refresh_token',
            expiresAt: futureIsoDate(1),
            refreshExpiresAt: futureIsoDate(7),
            scopes: ['resource:read']
        })
        connectors.items[0].expiresAt = new Date(Date.now() - 60 * 60 * 1_000)

        const runtime = await service.getRuntimeConnector({
            workspaceId: 'workspace-1',
            provider: 'managed-example',
            connectorId: start.connector.id
        })

        expect(strategy.refreshCredential).toHaveBeenCalledWith({
            app: {
                appId: 'cli_app_id',
                appSecret: 'transient_app_secret',
                brand: 'example'
            },
            refreshToken: 'refresh_token'
        })
        expect(runtime).toEqual(
            expect.objectContaining({
                appId: 'cli_app_id',
                brand: 'example',
                accessToken: 'refreshed_user_access_token'
            })
        )
        expect(runtime).not.toHaveProperty('app')
        expect(JSON.stringify(runtime)).not.toContain('transient_app_secret')
        expect(JSON.stringify(runtime)).not.toContain('refreshed_refresh_token')
    })

    it('clears plugin-managed authorization metadata when polling returns an error', async () => {
        strategy.definition = {
            provider: 'managed-example',
            label: 'Managed Example',
            auth: { type: 'oauth2' }
        }
        ;(strategy.buildAuthorizationUrl as jest.Mock).mockResolvedValueOnce({
            authorizationUrl: 'https://accounts.example.com/page/connector?user_code=user',
            scopes: ['resource:read'],
            pollIntervalSeconds: 5,
            metadata: {
                phase: 'user_authorization',
                deviceCode: 'user-device-code',
                appId: 'cli_app_id',
                appSecret: 'transient_app_secret'
            }
        })
        strategy.pollAuthorization = jest.fn().mockResolvedValueOnce({
            status: 'error',
            error: 'User authorization failed',
            metadata: {
                phase: 'user_authorization',
                deviceCode: 'user-device-code',
                appId: 'cli_app_id',
                appSecret: 'transient_app_secret'
            }
        })

        const start = await service.startOAuth('workspace-1', 'managed-example', {
            redirectUri: 'https://xpert.test/callback'
        })
        const result = await service.authorizationStatus('workspace-1', start.connector.id)

        expect(result.connector).toEqual(
            expect.objectContaining({
                status: 'error',
                lastError: 'User authorization failed'
            })
        )
        expect(sessions.items[0].consumedAt).toBeInstanceOf(Date)
        expect(sessions.items[0].metadataCiphertext).toBeNull()
        expect(JSON.stringify(sessions.items[0])).not.toContain('transient_app_secret')
    })

    it('returns connector definitions from registered strategies', async () => {
        await expect(service.definitions('workspace-1')).resolves.toEqual([
            expect.objectContaining({
                provider: 'example',
                authMethods: [expect.objectContaining({ id: 'oauth2', type: 'oauth2' })]
            })
        ])
    })

    it('requires an explicit authentication method when a provider declares more than one', async () => {
        strategy.definition = {
            provider: 'multi',
            label: 'Multi',
            authMethods: [
                { id: 'oauth', type: 'oauth2', label: 'OAuth' },
                { id: 'pat', type: 'api_key', label: 'PAT', credentials: {} }
            ]
        }
        strategy.connect = jest.fn()

        await expect(
            service.connect('workspace-1', 'multi', {
                redirectUri: 'https://xpert.test/callback'
            })
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(strategy.connect).not.toHaveBeenCalled()
    })

    it('activates an API key connector and exposes only the plugin runtime projection', async () => {
        strategy.definition = {
            provider: 'github',
            label: 'GitHub',
            authMethods: [
                { id: 'github-app-oauth', type: 'oauth2', label: 'GitHub App OAuth' },
                {
                    id: 'pat',
                    type: 'api_key',
                    label: 'PAT',
                    credentials: {
                        fields: [{ name: 'token', label: 'Token', required: true, type: 'password', secret: true }]
                    }
                }
            ]
        }
        strategy.connect = jest.fn().mockResolvedValue({
            status: 'active',
            credential: {
                data: {
                    accessToken: 'github_pat_secret',
                    tokenType: 'bearer',
                    clientSecret: 'must_not_reach_runtime'
                },
                profile: { name: 'octocat' }
            }
        })
        strategy.resolveRuntimeCredential = jest.fn(({ credential }) => ({
            accessToken: credential.data.accessToken,
            tokenType: credential.data.tokenType
        }))

        const connected = await service.connect('workspace-1', 'github', {
            authMethodId: 'pat',
            values: { token: 'github_pat_secret' },
            redirectUri: 'https://xpert.test/callback'
        })

        expect(connected).toEqual(
            expect.objectContaining({
                status: 'active',
                connector: expect.objectContaining({ status: 'active', authMethodId: 'pat' })
            })
        )
        expect(sessions.items).toHaveLength(0)
        expect(JSON.stringify(connectors.items[0])).not.toContain('github_pat_secret')

        const runtime = await service.getRuntimeConnectorCredential({
            workspaceId: 'workspace-1',
            provider: 'github'
        })
        expect(runtime).toEqual(
            expect.objectContaining({
                authMethodId: 'pat',
                credentials: {
                    accessToken: 'github_pat_secret',
                    tokenType: 'bearer'
                }
            })
        )
        expect(JSON.stringify(runtime)).not.toContain('must_not_reach_runtime')
    })

    it('marks an API key connection as error when its strategy returns pending', async () => {
        strategy.definition = {
            provider: 'github',
            label: 'GitHub',
            authMethods: [{ id: 'pat', type: 'api_key', label: 'PAT', credentials: {} }]
        }
        strategy.connect = jest.fn().mockResolvedValue({
            status: 'pending',
            authorizationUrl: 'https://github.test/invalid-pending'
        })

        await expect(
            service.connect('workspace-1', 'github', {
                authMethodId: 'pat',
                redirectUri: 'https://xpert.test/callback'
            })
        ).rejects.toBeInstanceOf(BadRequestException)

        expect(connectors.items[0]).toEqual(
            expect.objectContaining({
                status: 'error',
                lastError: expect.stringMatching(/\S/)
            })
        )
        expect(sessions.items).toHaveLength(0)
    })

    it('does not let an in-flight refresh overwrite a reconnected credential', async () => {
        strategy.definition = {
            provider: 'github',
            label: 'GitHub',
            authMethods: [{ id: 'pat', type: 'api_key', label: 'PAT', credentials: {} }]
        }
        strategy.connect = jest
            .fn()
            .mockResolvedValueOnce({
                status: 'active',
                credential: {
                    data: { accessToken: 'old_token', refreshToken: 'old_refresh' },
                    expiresAt: pastIsoDate(),
                    refreshExpiresAt: futureIsoDate(7)
                }
            })
            .mockResolvedValueOnce({
                status: 'active',
                credential: {
                    data: { accessToken: 'new_token', refreshToken: 'new_refresh' },
                    expiresAt: futureIsoDate(1),
                    refreshExpiresAt: futureIsoDate(7)
                }
            })
        strategy.resolveRuntimeCredential = jest.fn(({ credential }) => ({
            accessToken: credential.data.accessToken
        }))
        let markRefreshStarted: (() => void) | undefined
        let releaseRefresh: (() => void) | undefined
        const refreshStarted = new Promise<void>((resolve) => {
            markRefreshStarted = resolve
        })
        const refreshCanFinish = new Promise<void>((resolve) => {
            releaseRefresh = resolve
        })
        strategy.refreshConnectionCredential = jest.fn(async () => {
            markRefreshStarted?.()
            await refreshCanFinish
            return {
                data: { accessToken: 'stale_refreshed_token', refreshToken: 'stale_refresh' },
                expiresAt: futureIsoDate(1),
                refreshExpiresAt: futureIsoDate(7)
            }
        })

        await service.connect('workspace-1', 'github', {
            authMethodId: 'pat',
            redirectUri: 'https://xpert.test/callback'
        })
        const staleRuntime = service.getRuntimeConnectorCredential({
            workspaceId: 'workspace-1',
            provider: 'github'
        })
        await refreshStarted
        await service.connect('workspace-1', 'github', {
            authMethodId: 'pat',
            redirectUri: 'https://xpert.test/callback'
        })
        releaseRefresh?.()

        await expect(staleRuntime).rejects.toBeInstanceOf(BadRequestException)
        await expect(
            service.getRuntimeConnectorCredential({
                workspaceId: 'workspace-1',
                provider: 'github'
            })
        ).resolves.toEqual(
            expect.objectContaining({
                credentials: { accessToken: 'new_token' }
            })
        )
        expect(connectors.items[0]).toEqual(expect.objectContaining({ status: 'active', lastError: null }))
    })

    it('binds concurrent OAuth callbacks to the current connection attempt and authentication method', async () => {
        strategy.definition = {
            provider: 'multi-oauth',
            label: 'Multi OAuth',
            authMethods: [
                { id: 'oauth-a', type: 'oauth2', label: 'OAuth A' },
                { id: 'oauth-b', type: 'oauth2', label: 'OAuth B' }
            ]
        }
        let firstState = ''
        let secondState = ''
        let releaseFirst: (() => void) | undefined
        let markFirstStarted: (() => void) | undefined
        const firstStarted = new Promise<void>((resolve) => {
            markFirstStarted = resolve
        })
        const firstCanFinish = new Promise<void>((resolve) => {
            releaseFirst = resolve
        })
        let connectCall = 0
        strategy.connect = jest.fn(async (input) => {
            connectCall += 1
            if (connectCall === 1) {
                firstState = input.state
                markFirstStarted?.()
                await firstCanFinish
                return {
                    status: 'pending' as const,
                    authorizationUrl: 'https://oauth-a.test/authorize'
                }
            }
            secondState = input.state
            return {
                status: 'pending' as const,
                authorizationUrl: 'https://oauth-b.test/authorize'
            }
        })
        strategy.exchangeAuthorizationCode = jest.fn(async ({ authMethodId }) => ({
            data: { accessToken: `${authMethodId}_token` }
        }))

        const firstConnection = service.connect('workspace-1', 'multi-oauth', {
            authMethodId: 'oauth-a',
            redirectUri: 'https://xpert.test/callback'
        })
        await firstStarted
        const secondConnection = await service.connect('workspace-1', 'multi-oauth', {
            authMethodId: 'oauth-b',
            redirectUri: 'https://xpert.test/callback'
        })
        releaseFirst?.()

        await expect(firstConnection).rejects.toBeInstanceOf(BadRequestException)
        await expect(service.completeOAuthCallback({ state: firstState, code: 'code-a' })).rejects.toBeInstanceOf(
            BadRequestException
        )
        const activated = await service.completeOAuthCallback({ state: secondState, code: 'code-b' })

        expect(secondConnection.connector.authMethodId).toBe('oauth-b')
        expect(activated).toEqual(expect.objectContaining({ status: 'active', authMethodId: 'oauth-b' }))
        expect(strategy.exchangeAuthorizationCode).toHaveBeenCalledTimes(1)
        expect(strategy.exchangeAuthorizationCode).toHaveBeenCalledWith(
            expect.objectContaining({ authMethodId: 'oauth-b', code: 'code-b' })
        )
    })

    it('resolves a real legacy ciphertext through an explicit multi-auth legacy mapping', async () => {
        strategy.definition = {
            provider: 'legacy-multi',
            label: 'Legacy Multi',
            legacyAuthMethodId: 'oauth',
            authMethods: [
                { id: 'oauth', type: 'oauth2', label: 'OAuth' },
                { id: 'pat', type: 'api_key', label: 'PAT', credentials: {} }
            ]
        }
        await connectors.save(
            connectors.create({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: 'workspace-1',
                provider: 'legacy-multi',
                authMethodId: null,
                status: 'active',
                credentialCiphertext: encryptSecret(
                    JSON.stringify({
                        appId: 'legacy_app_id',
                        accessToken: 'legacy_access_token',
                        scopes: ['legacy:read']
                    }),
                    environment.secretsEncryptionKey
                )
            })
        )

        await expect(
            service.getRuntimeConnectorCredential({
                workspaceId: 'workspace-1',
                provider: 'legacy-multi'
            })
        ).resolves.toEqual(
            expect.objectContaining({
                authMethodId: 'oauth',
                credentials: expect.objectContaining({
                    appId: 'legacy_app_id',
                    accessToken: 'legacy_access_token'
                })
            })
        )
    })

    it('preserves OAuth session scopes when callback credentials omit them', async () => {
        ;(strategy.exchangeOAuthCode as jest.Mock).mockResolvedValueOnce({
            appId: 'example_app_id',
            accessToken: 'uat_secret'
        })
        const start = await service.startOAuth('workspace-1', 'example', {
            app: connectorApp(),
            redirectUri: 'https://xpert.test/callback'
        })
        const state = (strategy.buildAuthorizationUrl as jest.Mock).mock.calls[0][0].state

        const activated = await service.completeOAuthCallback({ state, code: 'code-1' })

        expect(activated.scopes).toEqual(['docs:doc:read'])
        expect(connectors.items[0].scopes).toEqual(['docs:doc:read'])
        expect(start.connector.status).toBe('pending')
    })

    it('preserves OAuth session scopes when polled credentials omit them', async () => {
        strategy.pollAuthorization = jest.fn().mockResolvedValueOnce({
            status: 'complete',
            credential: {
                appId: 'example_app_id',
                accessToken: 'uat_secret'
            }
        })
        const start = await service.startOAuth('workspace-1', 'example', {
            app: connectorApp(),
            redirectUri: 'https://xpert.test/callback'
        })

        const result = await service.authorizationStatus('workspace-1', start.connector.id)

        expect(result.connector.scopes).toEqual(['docs:doc:read'])
        expect(connectors.items[0].scopes).toEqual(['docs:doc:read'])
    })

    it('reuses the provider instance when switching authentication methods', async () => {
        strategy.definition = {
            provider: 'github',
            label: 'GitHub',
            authMethods: [
                { id: 'github-app-oauth', type: 'oauth2', label: 'GitHub App OAuth' },
                { id: 'pat', type: 'api_key', label: 'PAT', credentials: {} }
            ]
        }
        strategy.connect = jest
            .fn()
            .mockResolvedValueOnce({
                status: 'active',
                credential: { data: { accessToken: 'pat', tokenType: 'bearer' } }
            })
            .mockResolvedValueOnce({
                status: 'active',
                credential: { data: { accessToken: 'oauth', tokenType: 'bearer' } }
            })

        const first = await service.connect('workspace-1', 'github', {
            authMethodId: 'pat',
            redirectUri: 'https://xpert.test/callback'
        })
        const second = await service.connect('workspace-1', 'github', {
            authMethodId: 'github-app-oauth',
            redirectUri: 'https://xpert.test/callback'
        })

        expect(second.connector.id).toBe(first.connector.id)
        expect(second.connector.authMethodId).toBe('github-app-oauth')
        expect(connectors.items).toHaveLength(1)
    })

    it('returns connector provider options from registered strategy definitions', async () => {
        await expect(service.providerOptions('workspace-1')).resolves.toEqual([
            expect.objectContaining({
                value: 'example',
                label: 'Example Connector'
            })
        ])
    })

    it('uses the connector provider label as the select option name and keeps the user profile in the description', async () => {
        const start = await service.startOAuth('workspace-1', 'example', {
            app: connectorApp(),
            redirectUri: 'https://xpert.test/api/connector/oauth/callback'
        })
        const state = (strategy.buildAuthorizationUrl as jest.Mock).mock.calls[0][0].state
        await service.completeOAuthCallback({ state, code: 'code-1' })

        await expect(service.selectOptions('workspace-1', 'example')).resolves.toEqual([
            expect.objectContaining({
                value: start.connector.id,
                label: 'Example Connector',
                description: {
                    en_US: 'Authorized account: Ada',
                    zh_Hans: '授权账号：Ada'
                }
            })
        ])
    })

    it('rejects expired OAuth sessions', async () => {
        ;(strategy.buildAuthorizationUrl as jest.Mock).mockResolvedValueOnce({
            authorizationUrl: 'https://oauth.example.com/authorize?state=state-1',
            scopes: ['docs:doc:read'],
            metadata: {
                phase: 'pending',
                appSecret: 'expired_app_secret'
            }
        })
        const start = await service.startOAuth('workspace-1', 'example', {
            app: connectorApp(),
            redirectUri: 'https://xpert.test/callback'
        })
        sessions.items[0].expiresAt = new Date(Date.now() - 1_000)

        const state = (strategy.buildAuthorizationUrl as jest.Mock).mock.calls[0][0].state
        await expect(service.completeOAuthCallback({ state, code: 'code-1' })).rejects.toBeInstanceOf(
            BadRequestException
        )
        expect(connectors.items.find((item) => item.id === start.connector.id)?.status).toBe('expired')
        expect(sessions.items[0].consumedAt).toBeInstanceOf(Date)
        expect(sessions.items[0].metadataCiphertext).toBeNull()
    })

    it('marks pending connectors expired when authorization polling finds only expired sessions', async () => {
        ;(strategy.buildAuthorizationUrl as jest.Mock).mockResolvedValueOnce({
            authorizationUrl: 'https://oauth.example.com/authorize?state=state-1',
            scopes: ['docs:doc:read'],
            metadata: {
                phase: 'pending',
                appSecret: 'expired_poll_secret'
            }
        })
        const start = await service.startOAuth('workspace-1', 'example', {
            app: connectorApp(),
            redirectUri: 'https://xpert.test/callback'
        })
        sessions.items[0].expiresAt = new Date(Date.now() - 1_000)

        await expect(service.authorizationStatus('workspace-1', start.connector.id)).resolves.toEqual(
            expect.objectContaining({
                connector: expect.objectContaining({
                    id: start.connector.id,
                    status: 'expired'
                }),
                authorizationUrl: null,
                pollIntervalSeconds: null
            })
        )
        expect(connectors.items.find((item) => item.id === start.connector.id)?.status).toBe('expired')
        expect(sessions.items[0].consumedAt).toBeInstanceOf(Date)
        expect(sessions.items[0].metadataCiphertext).toBeNull()
    })

    it('keeps one immutable authorization mode for a provider in each scope', async () => {
        strategy.definition = {
            ...strategy.definition,
            authorizationModes: ['personal', 'shared']
        }

        const binding = await service.createBinding({
            scope: { type: 'workspace', workspaceId: 'workspace-1' },
            provider: 'example',
            authorizationMode: 'personal'
        })

        expect(binding).toEqual(
            expect.objectContaining({
                scope: { type: 'workspace', workspaceId: 'workspace-1' },
                authorizationMode: 'personal'
            })
        )
        await expect(
            service.createBinding({
                scope: { type: 'workspace', workspaceId: 'workspace-1' },
                provider: 'example',
                authorizationMode: 'shared'
            })
        ).rejects.toBeInstanceOf(BadRequestException)
        await expect(
            service.connect('workspace-1', 'example', {
                redirectUri: 'https://xpert.test/callback'
            })
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('keeps providers without authorizationModes shared-only for compatibility', async () => {
        await expect(
            service.createBinding({
                scope: { type: 'workspace', workspaceId: 'workspace-1' },
                provider: 'example',
                authorizationMode: 'personal'
            })
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('keeps personal credentials and grants separate for two Project members', async () => {
        strategy.definition = {
            ...strategy.definition,
            authorizationModes: ['personal', 'shared']
        }
        ;(strategy.exchangeOAuthCode as jest.Mock)
            .mockResolvedValueOnce({
                appId: 'example_app_id',
                accessToken: 'user_1_token',
                expiresAt: futureIsoDate(1),
                profile: { name: 'User One' }
            })
            .mockResolvedValueOnce({
                appId: 'example_app_id',
                accessToken: 'user_2_token',
                expiresAt: futureIsoDate(1),
                profile: { name: 'User Two' }
            })

        const binding = await service.createBinding({
            scope: { type: 'project', projectId: 'project-1' },
            provider: 'example',
            authorizationMode: 'personal'
        })
        await service.connectBinding(binding.id, {
            xpertId: 'xpert-1',
            redirectUri: 'https://xpert.test/callback'
        })
        const userOneState = (strategy.buildAuthorizationUrl as jest.Mock).mock.calls[0][0].state
        expect(sessions.items[0]).toEqual(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                scopeType: 'project',
                projectId: 'project-1',
                workspaceId: null,
                authorizationMode: 'personal',
                actorUserId: 'user-1',
                xpertId: 'xpert-1',
                connectionAttemptId: expect.any(String),
                connectorId: binding.id
            })
        )
        await service.completeOAuthCallback({ state: userOneState, code: 'user-1-code' })

        currentUserId = 'user-2'
        await service.connectBinding(binding.id, {
            xpertId: 'xpert-1',
            redirectUri: 'https://xpert.test/callback'
        })
        const userTwoState = (strategy.buildAuthorizationUrl as jest.Mock).mock.calls[1][0].state
        await service.completeOAuthCallback({ state: userTwoState, code: 'user-2-code' })

        expect(personalAccounts.items).toEqual([
            expect.objectContaining({ userId: 'user-1', profile: { name: 'User One' } }),
            expect.objectContaining({ userId: 'user-2', profile: { name: 'User Two' } })
        ])
        expect(personalGrants.items).toEqual([
            expect.objectContaining({ connectorId: binding.id, userId: 'user-1' }),
            expect.objectContaining({ connectorId: binding.id, userId: 'user-2' })
        ])

        currentUserId = 'user-1'
        const userOneRuntimeScope = {
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1',
            projectId: 'project-1',
            xpertId: 'xpert-1',
            conversationId: 'conversation-1',
            executionId: 'execution-1',
            connectorBindingIds: [binding.id]
        }
        await expect(
            service.resolveSelectedRuntimeBindings([binding.id], {
                ...userOneRuntimeScope,
                conversationId: null
            })
        ).rejects.toBeInstanceOf(BadRequestException)
        await expect(
            service.resolveSelectedRuntimeBindings([binding.id, binding.id], userOneRuntimeScope)
        ).resolves.toEqual([{ bindingId: binding.id, provider: 'example' }])
        await expect(
            service.getRuntimeConnectorCredentialForScope({ bindingId: binding.id }, userOneRuntimeScope)
        ).resolves.toEqual(
            expect.objectContaining({
                bindingId: binding.id,
                authorizationMode: 'personal',
                projectId: 'project-1',
                credentials: expect.objectContaining({ accessToken: 'user_1_token' })
            })
        )

        currentUserId = 'user-2'
        await expect(
            service.getRuntimeConnectorCredentialForScope(
                { bindingId: binding.id },
                {
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    userId: 'user-2',
                    projectId: 'project-1',
                    xpertId: 'xpert-1',
                    conversationId: 'conversation-2',
                    executionId: 'execution-2',
                    connectorBindingIds: [binding.id]
                }
            )
        ).resolves.toEqual(
            expect.objectContaining({
                credentials: expect.objectContaining({ accessToken: 'user_2_token' })
            })
        )
        await expect(
            service.getRuntimeConnectorCredentialForScope(
                { bindingId: binding.id },
                {
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    userId: 'user-2',
                    projectId: 'project-2',
                    xpertId: 'xpert-1',
                    conversationId: 'conversation-denied',
                    executionId: 'execution-denied',
                    connectorBindingIds: [binding.id]
                }
            )
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(runtimeAudits.items).toEqual([
            expect.objectContaining({ actorUserId: 'user-1', connectorId: binding.id, outcome: 'resolved' }),
            expect.objectContaining({ actorUserId: 'user-2', connectorId: binding.id, outcome: 'resolved' }),
            expect.objectContaining({
                actorUserId: 'user-2',
                connectorId: binding.id,
                projectId: 'project-1',
                conversationId: 'conversation-denied',
                executionId: 'execution-denied',
                outcome: 'denied',
                errorCode: 'access_denied'
            })
        ])
    })

    it('requires separate consent before reusing a personal account in another binding', async () => {
        strategy.definition = {
            ...strategy.definition,
            authorizationModes: ['personal', 'shared']
        }
        strategy.connect = jest.fn().mockResolvedValue({
            status: 'active',
            credential: {
                data: { appId: 'example_app_id', accessToken: 'personal_token' },
                profile: { name: 'User One' }
            }
        })
        const workspaceBinding = await service.createBinding({
            scope: { type: 'workspace', workspaceId: 'workspace-1' },
            provider: 'example',
            authorizationMode: 'personal'
        })
        await service.connectBinding(workspaceBinding.id, {
            redirectUri: 'https://xpert.test/callback'
        })
        const projectBinding = await service.createBinding({
            scope: { type: 'project', projectId: 'project-1' },
            provider: 'example',
            authorizationMode: 'personal'
        })

        await expect(service.authorizationStatusBinding(projectBinding.id)).resolves.toEqual(
            expect.objectContaining({
                granted: false,
                connector: expect.objectContaining({ status: 'active', profile: { name: 'User One' } })
            })
        )
        await service.consentPersonalBinding(projectBinding.id)
        await expect(service.authorizationStatusBinding(projectBinding.id)).resolves.toEqual(
            expect.objectContaining({ granted: true })
        )
        expect(personalAccounts.items).toHaveLength(1)
        expect(personalGrants.items).toEqual([
            expect.objectContaining({ connectorId: workspaceBinding.id, userId: 'user-1' }),
            expect.objectContaining({ connectorId: projectBinding.id, userId: 'user-1' })
        ])
    })

    it('invalidates an older OAuth session when the same personal account reconnects elsewhere', async () => {
        strategy.definition = {
            ...strategy.definition,
            authorizationModes: ['personal', 'shared']
        }
        const workspaceBinding = await service.createBinding({
            scope: { type: 'workspace', workspaceId: 'workspace-1' },
            provider: 'example',
            authorizationMode: 'personal'
        })
        const projectBinding = await service.createBinding({
            scope: { type: 'project', projectId: 'project-1' },
            provider: 'example',
            authorizationMode: 'personal'
        })

        await service.connectBinding(workspaceBinding.id, {
            redirectUri: 'https://xpert.test/callback'
        })
        const firstState = (strategy.buildAuthorizationUrl as jest.Mock).mock.calls[0][0].state
        await service.connectBinding(projectBinding.id, {
            redirectUri: 'https://xpert.test/callback'
        })

        expect(sessions.items[0].consumedAt).toBeInstanceOf(Date)
        await expect(service.completeOAuthCallback({ state: firstState, code: 'stale-code' })).rejects.toBeInstanceOf(
            BadRequestException
        )
        expect(personalGrants.items).toHaveLength(0)
    })

    it('denies Connector runtime access unless the binding was selected for this conversation', async () => {
        await expect(
            service.getRuntimeConnectorCredentialForScope(
                { bindingId: 'binding-1' },
                {
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    userId: 'user-1',
                    projectId: 'project-1',
                    xpertId: 'xpert-1',
                    connectorBindingIds: []
                }
            )
        ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('returns only Project bindings and sanitized auth forms in Project runtime options', async () => {
        strategy.definition = {
            ...strategy.definition,
            authorizationModes: ['personal', 'shared']
        }
        const workspaceBinding = await service.createBinding({
            scope: { type: 'workspace', workspaceId: 'workspace-1' },
            provider: 'example',
            authorizationMode: 'personal'
        })
        const projectBinding = await service.createBinding({
            scope: { type: 'project', projectId: 'project-1' },
            provider: 'example',
            authorizationMode: 'personal'
        })

        const options = await service.runtimeOptions('xpert-1', 'project-1')

        expect(options.scope).toEqual({ type: 'project', projectId: 'project-1' })
        expect(options.items).toEqual([
            expect.objectContaining({
                bindingId: projectBinding.id,
                authorizationMode: 'personal',
                granted: false,
                authMethods: [
                    expect.objectContaining({
                        id: 'oauth2',
                        appCredentials: expect.objectContaining({
                            defaultValues: { region: 'test' }
                        })
                    })
                ]
            })
        ])
        expect(options.items).not.toEqual(
            expect.arrayContaining([expect.objectContaining({ bindingId: workspaceBinding.id })])
        )
    })

    it('returns only the current Xpert Workspace bindings when no Project is selected', async () => {
        strategy.definition = {
            ...strategy.definition,
            authorizationModes: ['personal', 'shared']
        }
        const workspaceBinding = await service.createBinding({
            scope: { type: 'workspace', workspaceId: 'workspace-1' },
            provider: 'example',
            authorizationMode: 'personal'
        })
        const projectBinding = await service.createBinding({
            scope: { type: 'project', projectId: 'project-1' },
            provider: 'example',
            authorizationMode: 'personal'
        })

        const options = await service.runtimeOptions('xpert-1')

        expect(options.scope).toEqual({ type: 'workspace', workspaceId: 'workspace-1' })
        expect(options.items).toEqual([
            expect.objectContaining({
                bindingId: workspaceBinding.id,
                authorizationMode: 'personal'
            })
        ])
        expect(options.items).not.toEqual(
            expect.arrayContaining([expect.objectContaining({ bindingId: projectBinding.id })])
        )
    })

    it('does not offer shared Workspace credentials to a non-member Xpert runner', async () => {
        const binding = await service.createBinding({
            scope: { type: 'workspace', workspaceId: 'workspace-1' },
            provider: 'example',
            authorizationMode: 'shared'
        })
        currentUserId = 'user-2'

        const options = await service.runtimeOptions('xpert-1')

        expect(options.scope).toEqual({ type: 'workspace', workspaceId: 'workspace-1' })
        expect(options.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ bindingId: binding.id })]))
        await expect(
            service.resolveSelectedRuntimeBindings([binding.id], {
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'user-2',
                workspaceId: 'workspace-1',
                xpertId: 'xpert-1',
                conversationId: 'conversation-1',
                executionId: 'execution-1',
                connectorBindingIds: [binding.id]
            })
        ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('lets a non-member Xpert runner authorize a personal Workspace connector with their own account', async () => {
        strategy.definition = {
            ...strategy.definition,
            authorizationModes: ['personal', 'shared']
        }
        strategy.connect = jest.fn().mockResolvedValue({
            status: 'active',
            credential: {
                data: { appId: 'example_app_id', accessToken: 'user_2_token' },
                profile: { name: 'User Two' }
            }
        })
        const binding = await service.createBinding({
            scope: { type: 'workspace', workspaceId: 'workspace-1' },
            provider: 'example',
            authorizationMode: 'personal'
        })
        currentUserId = 'user-2'

        await expect(
            service.connectBinding(binding.id, {
                xpertId: 'xpert-1',
                redirectUri: 'https://xpert.test/callback'
            })
        ).resolves.toEqual(
            expect.objectContaining({
                status: 'active',
                connector: expect.objectContaining({ status: 'active', profile: { name: 'User Two' } })
            })
        )
        expect(publishedXpertAccess.getAccessiblePublishedXpert).toHaveBeenCalledWith('xpert-1', {
            relations: ['workspace']
        })
        expect(personalGrants.items).toEqual([expect.objectContaining({ connectorId: binding.id, userId: 'user-2' })])
        await expect(
            service.resolveSelectedRuntimeBindings([binding.id], {
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'user-2',
                workspaceId: 'workspace-1',
                xpertId: 'xpert-1',
                conversationId: 'conversation-1',
                executionId: 'execution-1',
                connectorBindingIds: [binding.id]
            })
        ).resolves.toEqual([{ bindingId: binding.id, provider: 'example' }])
    })

    it('treats legacy workspace Connector rows without discriminators as shared', async () => {
        await connectors.save(
            connectors.create({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: 'workspace-1',
                provider: 'example',
                status: 'disconnected'
            })
        )

        await expect(service.list('workspace-1')).resolves.toEqual([
            expect.objectContaining({
                scopeType: 'workspace',
                scope: { type: 'workspace', workspaceId: 'workspace-1' },
                authorizationMode: 'shared'
            })
        ])
    })

    it('revokes only the removed member Project grants and keeps the personal account', async () => {
        const projectBinding = await connectors.save(
            connectors.create({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                scopeType: 'project',
                projectId: 'project-1',
                workspaceId: null,
                provider: 'example',
                authorizationMode: 'personal',
                status: 'active'
            })
        )
        const workspaceBinding = await connectors.save(
            connectors.create({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                scopeType: 'workspace',
                projectId: null,
                workspaceId: 'workspace-1',
                provider: 'example',
                authorizationMode: 'personal',
                status: 'active'
            })
        )
        const account = await personalAccounts.save(
            personalAccounts.create({
                tenantId: 'tenant-1',
                userId: 'user-1',
                provider: 'example',
                status: 'pending',
                connectionAttemptId: 'attempt-1'
            })
        )
        const session = await sessions.save(
            sessions.create({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                stateHash: 'state-hash',
                scopeType: 'project',
                workspaceId: null,
                projectId: 'project-1',
                authorizationMode: 'personal',
                connectorId: projectBinding.id,
                personalAccountId: account.id,
                actorUserId: 'user-1',
                xpertId: 'xpert-1',
                connectionAttemptId: 'attempt-1',
                provider: 'example',
                redirectUri: 'https://xpert.test/callback',
                expiresAt: new Date(Date.now() + 60_000)
            })
        )
        await personalGrants.save(
            personalGrants.create({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                connectorId: projectBinding.id,
                accountId: account.id,
                userId: 'user-1',
                grantedAt: new Date()
            })
        )
        await personalGrants.save(
            personalGrants.create({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                connectorId: workspaceBinding.id,
                accountId: account.id,
                userId: 'user-1',
                grantedAt: new Date()
            })
        )

        await service.revokeProjectMemberGrants({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            projectId: 'project-1',
            userId: 'user-1',
            actorId: 'manager-1'
        })

        expect(personalAccounts.items).toEqual([
            expect.objectContaining({ id: account.id, status: 'disconnected', credentialCiphertext: null })
        ])
        expect(personalGrants.items).toEqual([
            expect.objectContaining({ connectorId: workspaceBinding.id, userId: 'user-1' })
        ])
        expect(session.consumedAt).toBeInstanceOf(Date)
        expect(session.metadataCiphertext).toBeNull()
    })
})

class InMemoryRepository<T extends { id?: string }> {
    readonly items: T[] = []
    private next = 1

    create(input: Partial<T>): T {
        return input as T
    }

    async save(input: T): Promise<T> {
        if (!input.id) {
            input.id = `id-${this.next++}`
        }
        const index = this.items.findIndex((item) => item.id === input.id)
        if (index >= 0) {
            this.items[index] = input
        } else {
            this.items.push(input)
        }
        return input
    }

    async update(criteria: FindOptionsWhere<T>, input: Partial<T>) {
        const matches = this.items.filter((item) =>
            Object.entries(criteria).every(([key, expected]) => matchesFindValue(Reflect.get(item, key), expected))
        )
        for (const item of matches) {
            Object.assign(item, input)
        }
        return { affected: matches.length }
    }

    async findOne(options: { where: Partial<T> }): Promise<T | null> {
        return (
            this.items.find((item) =>
                Object.entries(options.where).every(([key, value]) => Reflect.get(item, key) === value)
            ) ?? null
        )
    }

    async find(options?: { where?: Partial<T> }): Promise<T[]> {
        if (!options?.where) {
            return [...this.items]
        }
        return this.items.filter((item) =>
            Object.entries(options.where ?? {}).every(([key, value]) => Reflect.get(item, key) === value)
        )
    }

    async delete(criteria: FindOptionsWhere<T>) {
        const retained = this.items.filter(
            (item) =>
                !Object.entries(criteria).every(([key, expected]) => matchesFindValue(Reflect.get(item, key), expected))
        )
        const affected = this.items.length - retained.length
        this.items.splice(0, this.items.length, ...retained)
        return { affected }
    }
}

function matchesFindValue(actual: unknown, expected: unknown) {
    if (expected instanceof FindOperator) {
        return expected.type === 'isNull' ? actual == null : actual === expected.value
    }
    return actual === expected
}

function futureIsoDate(days: number) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1_000).toISOString()
}

function connectorApp() {
    return {
        appId: 'example_app_id',
        appSecret: 'app_secret',
        preferLanguage: 'zh-Hans'
    }
}

function pastIsoDate() {
    return new Date(Date.now() - 60 * 60 * 1_000).toISOString()
}
