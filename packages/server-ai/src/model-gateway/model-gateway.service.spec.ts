import {
    AiModelTypeEnum,
    AIPermissionsEnum,
    ModelAccessChannelEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessSourceEnum,
    ModelAccessUnavailableReasonEnum,
    MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS_SETTING,
    MODEL_GATEWAY_REQUESTS_PER_MINUTE_SETTING,
    ModelGatewayApiKeyStatusEnum,
    ModelGatewayCallStatusEnum,
    ModelGatewayUsageSourceEnum,
    MODEL_GATEWAY_CALL_RETENTION_DAYS_SETTING,
    MODEL_GATEWAY_CALL_RETENTION_ENABLED_SETTING,
    UserType
} from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import { decryptSecret, encryptSecret, RequestContext, User } from '@xpert-ai/server-core'
import { ModelGatewayApiKey } from './model-gateway-api-key.entity'
import { ModelGatewayCall } from './model-gateway-call.entity'
import { ModelGatewayPublication } from './model-gateway-publication.entity'
import { ModelGatewayService } from './model-gateway.service'

function createService(options?: {
    publications?: ModelGatewayPublication[]
    resolutions?: Record<
        string,
        { allowed: boolean; grantId?: string; unavailableReason?: ModelAccessUnavailableReasonEnum }
    >
    call?: ModelGatewayCall
    callsInWindow?: number
    activeCalls?: number
    tenantSettings?: Array<{ name: string; value: string }>
    apiKey?: ModelGatewayApiKey | null
    adminKeys?: ModelGatewayApiKey[]
    adminCalls?: ModelGatewayCall[]
    pendingCalls?: ModelGatewayCall[]
    users?: Array<Partial<User>>
}) {
    const publicationQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(options?.publications?.[0] ?? null),
        getMany: jest.fn().mockResolvedValue(options?.publications ?? [])
    }
    const publicationRepository = {
        createQueryBuilder: jest.fn().mockReturnValue(publicationQueryBuilder)
    }
    const callQueryBuilder = {
        addSelect: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([options?.adminCalls ?? [], options?.adminCalls?.length ?? 0]),
        getMany: jest.fn().mockResolvedValue(options?.pendingCalls ?? []),
        execute: jest.fn().mockResolvedValue({ affected: 0 })
    }
    const callRepository = {
        find: jest.fn().mockResolvedValue(options?.pendingCalls ?? []),
        findOne: jest.fn().mockResolvedValue(options?.call ?? null),
        save: jest.fn(async (call) => call),
        createQueryBuilder: jest.fn().mockReturnValue(callQueryBuilder),
        manager: {
            query: jest.fn().mockResolvedValue([{ count: 0 }])
        }
    }
    const apiKeyQueryBuilder = {
        addSelect: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(options?.apiKey ?? null),
        getMany: jest.fn().mockResolvedValue(options?.adminKeys ?? []),
        getManyAndCount: jest.fn().mockResolvedValue([options?.adminKeys ?? [], options?.adminKeys?.length ?? 0]),
        execute: jest.fn().mockResolvedValue({ affected: 0 })
    }
    const apiKeyRepository = {
        createQueryBuilder: jest.fn().mockReturnValue(apiKeyQueryBuilder),
        find: jest.fn().mockResolvedValue([]),
        create: jest.fn((key) => key),
        save: jest.fn(async (key) => key),
        update: jest.fn().mockResolvedValue({ affected: 0 })
    }
    const settingsRepository = {
        findOne: jest.fn().mockResolvedValue({
            tenantId: 'tenant-1',
            storeBodies: false,
            bodyRetentionDays: 7
        }),
        create: jest.fn((settings) => settings),
        save: jest.fn(async (settings) => settings)
    }
    const transactionCallRepository = {
        count: jest
            .fn()
            .mockResolvedValueOnce(options?.callsInWindow ?? 0)
            .mockResolvedValueOnce(options?.activeCalls ?? 0),
        create: jest.fn((call) => call),
        save: jest.fn(async (call) => call)
    }
    const manager = {
        findOne: jest.fn().mockResolvedValue({ id: 'user-1' }),
        getRepository: jest.fn().mockReturnValue(transactionCallRepository)
    }
    const dataSource = {
        transaction: jest.fn(async (callback) => callback(manager))
    }
    const tenantSettingRepository = {
        find: jest.fn().mockResolvedValue(options?.tenantSettings ?? []),
        create: jest.fn((setting) => setting),
        save: jest.fn(async (settings) => settings)
    }
    const userRepository = {
        find: jest.fn().mockResolvedValue(options?.users ?? []),
        findOne: jest.fn().mockResolvedValue({
            id: 'user-1',
            tenantId: 'tenant-1',
            type: UserType.USER,
            role: {
                rolePermissions: [{ permission: AIPermissionsEnum.MODEL_GATEWAY_USE, enabled: true }]
            }
        })
    }
    const modelAccessService = {
        isModelGatewayFeatureEnabled: jest.fn().mockResolvedValue(true),
        resolveExternalModelAccess: jest.fn(async ({ publicationId }) => ({
            allowed: false,
            channel: ModelAccessChannelEnum.ExternalApi,
            billableUserId: 'user-1',
            copilotId: 'copilot-1',
            copilotModelId: 'source-model',
            provider: 'openai',
            modelType: AiModelTypeEnum.LLM,
            model: 'source-model',
            accessSource: ModelAccessSourceEnum.Grant,
            multiplier: 1,
            scope: ModelAccessOwnershipScopeEnum.Tenant,
            organizationId: null,
            gatewayPublicationId: publicationId,
            externalModelId: publicationId,
            ...(options?.resolutions?.[publicationId] ?? {})
        }))
    }
    const membershipService = {
        recordGatewayUsage: jest.fn().mockResolvedValue({
            chargedPoints: 2,
            excessPoints: 1,
            ledger: null
        })
    }
    const service = new ModelGatewayService(
        publicationRepository as never,
        apiKeyRepository as never,
        settingsRepository as never,
        callRepository as never,
        userRepository as never,
        tenantSettingRepository as never,
        modelAccessService as never,
        membershipService as never,
        {} as never,
        dataSource as never
    )
    return {
        apiKeyRepository,
        apiKeyQueryBuilder,
        callRepository,
        callQueryBuilder,
        dataSource,
        manager,
        membershipService,
        modelAccessService,
        publicationRepository,
        publicationQueryBuilder,
        settingsRepository,
        service,
        tenantSettingRepository,
        transactionCallRepository,
        userRepository
    }
}

function publication(id: string): ModelGatewayPublication {
    return {
        id,
        tenantId: 'tenant-1',
        copilotId: 'copilot-1',
        copilotModelId: 'source-model',
        provider: 'openai',
        modelType: AiModelTypeEnum.LLM,
        model: 'source-model',
        externalModelId: id,
        capabilities: []
    } as ModelGatewayPublication
}

function accessResolution(organizationId: string | null = null) {
    return {
        allowed: true,
        channel: ModelAccessChannelEnum.ExternalApi,
        billableUserId: 'user-1',
        copilotId: 'copilot-1',
        copilotModelId: 'source-model',
        provider: 'openai',
        modelType: AiModelTypeEnum.LLM,
        model: 'source-model',
        accessSource: ModelAccessSourceEnum.Grant,
        multiplier: 1,
        scope: organizationId ? ModelAccessOwnershipScopeEnum.Organization : ModelAccessOwnershipScopeEnum.Tenant,
        organizationId,
        grantId: 'grant-1'
    }
}

describe('ModelGatewayService', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(true)
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('returns body retention and request limits as one tenant gateway setting', async () => {
        const fixture = createService({
            tenantSettings: [
                { name: MODEL_GATEWAY_REQUESTS_PER_MINUTE_SETTING, value: '120' },
                { name: MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS_SETTING, value: '8' }
            ]
        })

        await expect(fixture.service.getSettings()).resolves.toMatchObject({
            tenantId: 'tenant-1',
            storeBodies: false,
            bodyRetentionDays: 7,
            requestsPerMinute: 120,
            maxConcurrentRequests: 8
        })
    })

    it('updates body retention and request limits together', async () => {
        const fixture = createService({
            tenantSettings: [{ name: MODEL_GATEWAY_REQUESTS_PER_MINUTE_SETTING, value: '60' }]
        })

        await fixture.service.updateSettings({
            storeBodies: true,
            bodyRetentionDays: 30,
            requestsPerMinute: 120,
            maxConcurrentRequests: 8
        })

        expect(fixture.settingsRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                storeBodies: true,
                bodyRetentionDays: 30
            })
        )
        expect(fixture.tenantSettingRepository.save).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    name: MODEL_GATEWAY_REQUESTS_PER_MINUTE_SETTING,
                    value: '120'
                }),
                expect.objectContaining({
                    name: MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS_SETTING,
                    value: '8'
                })
            ])
        )
    })

    it('preserves body retention for older settings updates that omit it', async () => {
        const fixture = createService()

        await fixture.service.updateSettings({
            storeBodies: true,
            requestsPerMinute: 120,
            maxConcurrentRequests: 8
        })

        expect(fixture.settingsRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                storeBodies: true,
                bodyRetentionDays: 7
            })
        )
    })

    it('isolates personal gateway data to organization scope while keeping admin settings tenant-only', async () => {
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(false)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        const fixture = createService()

        await expect(fixture.service.listMyKeys()).resolves.toEqual([])
        await expect(fixture.service.listMyCalls()).resolves.toEqual({ items: [], total: 0 })
        expect(fixture.apiKeyQueryBuilder.andWhere).toHaveBeenCalledWith(
            'apiKey.organizationId = :scopeOrganizationId',
            {
                scopeOrganizationId: 'org-1'
            }
        )
        expect(fixture.callQueryBuilder.andWhere).toHaveBeenCalledWith('call.organizationId = :scopeOrganizationId', {
            scopeOrganizationId: 'org-1'
        })
        expect(fixture.callQueryBuilder.andWhere).toHaveBeenCalledWith('call.userId = :userId', {
            userId: 'user-1'
        })
        await expect(fixture.service.getSettings()).rejects.toMatchObject({ status: 403 })
    })

    it('binds a new API key to the current organization scope', async () => {
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(false)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        const fixture = createService()

        await expect(fixture.service.createKey('Organization client')).resolves.toMatchObject({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1',
            name: 'Organization client'
        })
        expect(fixture.apiKeyRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'user-1'
            })
        )
        expect(fixture.modelAccessService.isModelGatewayFeatureEnabled).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })
    })

    it('revokes active organization API keys when the owner leaves the organization', async () => {
        const fixture = createService()

        await fixture.service.revokeOrganizationKeysForRemovedUser({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1'
        })

        expect(fixture.apiKeyRepository.update).toHaveBeenCalledWith(
            {
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'user-1',
                status: ModelGatewayApiKeyStatusEnum.Active
            },
            expect.objectContaining({
                status: ModelGatewayApiKeyStatusEnum.Revoked,
                revokedById: null,
                revokeReason: 'User left the organization.'
            })
        )
    })

    it('stores recoverable key material encrypted and returns it only from the personal key list', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        const fixture = createService()
        const created = await fixture.service.createKey('My client')
        const encryptedSecret = fixture.apiKeyRepository.create.mock.calls[0][0].encryptedSecret

        expect(encryptedSecret).toEqual(expect.any(String))
        expect(decryptSecret(encryptedSecret, environment.secretsEncryptionKey)).toBe(created.secret)

        fixture.apiKeyQueryBuilder.getMany.mockResolvedValue([
            {
                id: 'key-1',
                tenantId: 'tenant-1',
                organizationId: null,
                userId: 'user-1',
                name: 'My client',
                prefix: 'sk-xpert-prefix',
                encryptedSecret: encryptSecret(created.secret, environment.secretsEncryptionKey),
                status: ModelGatewayApiKeyStatusEnum.Active
            }
        ])

        const listed = await fixture.service.listMyKeys()
        expect(listed).toEqual([
            expect.objectContaining({
                id: 'key-1',
                secret: created.secret
            })
        ])
        expect(listed[0]).not.toHaveProperty('encryptedSecret')
        expect(fixture.apiKeyQueryBuilder.addSelect).toHaveBeenCalledWith('apiKey.encryptedSecret')
    })

    it('adds user display names to admin keys and calls without changing stored records', async () => {
        const apiKey = {
            id: 'key-1',
            tenantId: 'tenant-1',
            userId: 'user-1'
        } as ModelGatewayApiKey
        const call = {
            id: 'call-1',
            tenantId: 'tenant-1',
            userId: 'user-1'
        } as ModelGatewayCall
        const fixture = createService({
            adminKeys: [apiKey],
            adminCalls: [call],
            users: [
                {
                    id: 'user-1',
                    tenantId: 'tenant-1',
                    firstName: 'Yu',
                    lastName: 'Rongku',
                    email: 'yurongku@example.com'
                }
            ]
        })

        await expect(fixture.service.listAdminKeys()).resolves.toMatchObject({
            items: [{ id: 'key-1', userId: 'user-1', userName: 'Yu Rongku' }],
            total: 1
        })
        await expect(fixture.service.listAdminCalls()).resolves.toMatchObject({
            items: [{ id: 'call-1', userId: 'user-1', userName: 'Yu Rongku' }],
            total: 1
        })
        expect(apiKey).not.toHaveProperty('userName')
        expect(call).not.toHaveProperty('userName')
    })

    it('lists granted models but keeps only quota exhaustion as a non-callable list state', async () => {
        const fixture = createService({
            publications: [
                publication('allowed'),
                publication('quota'),
                publication('disabled'),
                publication('no-grant')
            ],
            resolutions: {
                allowed: { allowed: true, grantId: 'grant-1' },
                quota: {
                    allowed: false,
                    grantId: 'grant-2',
                    unavailableReason: ModelAccessUnavailableReasonEnum.QuotaExhausted
                },
                disabled: {
                    allowed: false,
                    grantId: 'grant-3',
                    unavailableReason: ModelAccessUnavailableReasonEnum.ModelDisabled
                },
                'no-grant': { allowed: false }
            }
        })

        const items = await fixture.service.listAccessiblePublications({
            apiKey: { tenantId: 'tenant-1' } as ModelGatewayApiKey,
            user: { id: 'user-1' } as never
        })

        expect(items.map(({ publication: item }) => item.id)).toEqual(['allowed', 'quota'])
    })

    it('restores organization scope from the API key when resolving accessible models', async () => {
        const organizationPublication = {
            ...publication('organization-model'),
            organizationId: 'org-1'
        } as ModelGatewayPublication
        const fixture = createService({
            publications: [organizationPublication],
            resolutions: {
                'organization-model': { allowed: true, grantId: 'grant-1' }
            }
        })

        await fixture.service.listAccessiblePublications({
            apiKey: { tenantId: 'tenant-1', organizationId: 'org-1' } as ModelGatewayApiKey,
            user: { id: 'user-1' } as never
        })

        expect(fixture.publicationQueryBuilder.andWhere).toHaveBeenCalledWith(
            '(publication.organizationId IS NULL OR publication.organizationId = :visibleOrganizationId)',
            { visibleOrganizationId: 'org-1' }
        )
        expect(fixture.modelAccessService.resolveExternalModelAccess).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1',
            publicationId: 'organization-model'
        })
    })

    it('records new calls in the API key organization scope', async () => {
        const fixture = createService()

        await expect(
            fixture.service.startCall({
                identity: {
                    apiKey: { id: 'key-1', tenantId: 'tenant-1', organizationId: 'org-1' } as ModelGatewayApiKey,
                    user: { id: 'user-1' } as never
                },
                publication: {
                    ...publication('organization-model'),
                    organizationId: 'org-1'
                } as ModelGatewayPublication,
                resolution: accessResolution('org-1'),
                requestBody: { model: 'organization-model' }
            })
        ).resolves.toMatchObject({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            apiKeyId: 'key-1'
        })
        expect(fixture.transactionCallRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                apiKeyId: 'key-1'
            })
        )
    })

    it('settles a started call once and records charged and excess points', async () => {
        const call = {
            id: 'call-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            requestId: 'request-1',
            userId: 'user-1',
            apiKeyId: 'key-1',
            provider: 'openai',
            model: 'source-model',
            status: ModelGatewayCallStatusEnum.Started,
            startedAt: new Date('2026-07-27T00:00:00.000Z')
        } as ModelGatewayCall
        const fixture = createService({ call })

        const result = await fixture.service.finishCall({
            call,
            resolution: {
                allowed: true,
                channel: ModelAccessChannelEnum.ExternalApi,
                billableUserId: 'user-1',
                copilotId: 'copilot-1',
                copilotModelId: 'source-model',
                provider: 'openai',
                modelType: AiModelTypeEnum.LLM,
                model: 'source-model',
                accessSource: ModelAccessSourceEnum.Grant,
                multiplier: 1,
                scope: ModelAccessOwnershipScopeEnum.Organization,
                organizationId: 'org-1',
                grantId: 'grant-1'
            },
            usage: {
                inputTokens: 100,
                outputTokens: 50,
                totalTokens: 150,
                source: ModelGatewayUsageSourceEnum.Provider
            }
        })

        expect(fixture.membershipService.recordGatewayUsage).toHaveBeenCalledWith(
            expect.objectContaining({
                gatewayRequestId: 'request-1',
                gatewayApiKeyId: 'key-1',
                tokenUsed: 150,
                userId: 'user-1',
                organizationId: 'org-1',
                copilotOrganizationId: 'org-1'
            })
        )
        expect(result).toMatchObject({
            status: ModelGatewayCallStatusEnum.Succeeded,
            chargedPoints: 2,
            excessPoints: 1,
            totalTokens: 150
        })
    })

    it('rejects the sixth concurrent call for the same user without queueing it', async () => {
        const fixture = createService({
            callsInWindow: 20,
            activeCalls: 5,
            tenantSettings: [
                { name: MODEL_GATEWAY_REQUESTS_PER_MINUTE_SETTING, value: '60' },
                { name: MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS_SETTING, value: '5' }
            ]
        })

        const promise = fixture.service.startCall({
            identity: {
                apiKey: { id: 'key-1', tenantId: 'tenant-1' } as ModelGatewayApiKey,
                user: { id: 'user-1' } as never
            },
            publication: publication('external-model'),
            resolution: accessResolution(),
            requestBody: { model: 'external-model' }
        })

        await expect(promise).rejects.toMatchObject({
            openAICode: 'rate_limit_exceeded',
            retryAfterSeconds: 1
        })
        expect(fixture.transactionCallRepository.save).not.toHaveBeenCalled()
    })

    it('rejects calls above the configured per-minute rate', async () => {
        const fixture = createService({
            callsInWindow: 60,
            activeCalls: 0,
            tenantSettings: [
                { name: MODEL_GATEWAY_REQUESTS_PER_MINUTE_SETTING, value: '60' },
                { name: MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS_SETTING, value: '5' }
            ]
        })

        await expect(
            fixture.service.startCall({
                identity: {
                    apiKey: { id: 'key-1', tenantId: 'tenant-1' } as ModelGatewayApiKey,
                    user: { id: 'user-1' } as never
                },
                publication: publication('external-model'),
                resolution: accessResolution(),
                requestBody: { model: 'external-model' }
            })
        ).rejects.toMatchObject({
            openAICode: 'rate_limit_exceeded',
            retryAfterSeconds: 60
        })
        expect(fixture.transactionCallRepository.save).not.toHaveBeenCalled()
    })

    it('persists known usage for a settlement retry without changing the upstream outcome', async () => {
        const call = {
            id: 'call-1',
            tenantId: 'tenant-1',
            requestId: 'request-1',
            status: ModelGatewayCallStatusEnum.Started,
            startedAt: new Date()
        } as ModelGatewayCall
        const fixture = createService({ call })

        const result = await fixture.service.recordSettlementFailure(
            call,
            {
                inputTokens: 12,
                outputTokens: 8,
                totalTokens: 20,
                source: ModelGatewayUsageSourceEnum.Provider
            },
            new Error('ledger unavailable')
        )

        expect(result).toMatchObject({
            status: ModelGatewayCallStatusEnum.SettlementPending,
            inputTokens: 12,
            outputTokens: 8,
            totalTokens: 20,
            errorCode: null
        })
    })

    it('retries a pending settlement idempotently and restores the upstream outcome', async () => {
        const startedAt = new Date('2026-07-27T10:00:00.000Z')
        const completedAt = new Date('2026-07-27T10:00:03.000Z')
        const call = {
            id: 'call-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            requestId: 'request-1',
            publicationId: 'publication-1',
            userId: 'user-1',
            apiKeyId: 'key-1',
            provider: 'openai',
            model: 'source-model',
            status: ModelGatewayCallStatusEnum.SettlementPending,
            startedAt,
            completedAt,
            durationMs: 3000,
            inputTokens: 12,
            outputTokens: 8,
            totalTokens: 20,
            usageSource: ModelGatewayUsageSourceEnum.Provider,
            settlementContext: accessResolution('org-1'),
            errorCode: null
        } as ModelGatewayCall
        const fixture = createService({
            call,
            pendingCalls: [call],
            resolutions: {
                'publication-1': { allowed: true, grantId: 'grant-1' }
            }
        })

        await fixture.service.retryPendingSettlements()

        expect(fixture.modelAccessService.resolveExternalModelAccess).not.toHaveBeenCalled()
        expect(fixture.membershipService.recordGatewayUsage).toHaveBeenCalledTimes(1)
        expect(fixture.membershipService.recordGatewayUsage).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                copilotOrganizationId: 'org-1',
                gatewayRequestId: 'request-1'
            })
        )
        expect(call.status).toBe(ModelGatewayCallStatusEnum.Succeeded)
        expect(call.completedAt).toEqual(completedAt)
        expect(call.durationMs).toBe(3000)
        expect(call.chargedPoints).toBe(2)
        expect(call.excessPoints).toBe(1)
        expect(call.settlementContext).toBeNull()
    })

    it('persists an expired key status during authentication', async () => {
        const key = {
            id: 'key-1',
            tenantId: 'tenant-1',
            userId: 'user-1',
            status: ModelGatewayApiKeyStatusEnum.Active,
            validUntil: new Date(Date.now() - 1000)
        } as ModelGatewayApiKey
        const fixture = createService({ apiKey: key })

        await expect(fixture.service.authenticate('Bearer expired-key')).rejects.toThrow()
        expect(fixture.apiKeyRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({ status: ModelGatewayApiKeyStatusEnum.Expired })
        )
    })

    it('marks stale started calls as interrupted without charging them', async () => {
        const fixture = createService()
        fixture.callQueryBuilder.execute.mockResolvedValue({ affected: 2 })

        await fixture.service.failStaleCalls()

        expect(fixture.callQueryBuilder.set).toHaveBeenCalledWith(
            expect.objectContaining({
                status: ModelGatewayCallStatusEnum.Failed,
                errorCode: 'gateway_interrupted'
            })
        )
        expect(fixture.membershipService.recordGatewayUsage).not.toHaveBeenCalled()
    })

    it('purges only terminal gateway call metadata for tenants that enabled retention', async () => {
        const fixture = createService()
        fixture.callRepository.manager.query.mockResolvedValueOnce([{ count: 2 }])

        await expect(fixture.service.purgeExpiredCalls()).resolves.toEqual({
            deleted: 2,
            batches: 1,
            batchLimitReached: false
        })

        expect(fixture.callRepository.manager.query).toHaveBeenNthCalledWith(
            1,
            expect.stringContaining('DELETE FROM model_gateway_call'),
            [
                MODEL_GATEWAY_CALL_RETENTION_ENABLED_SETTING,
                MODEL_GATEWAY_CALL_RETENTION_DAYS_SETTING,
                60,
                3650,
                [ModelGatewayCallStatusEnum.Succeeded, ModelGatewayCallStatusEnum.Failed],
                1000
            ]
        )
        expect(fixture.callRepository.manager.query.mock.calls[0][0]).toContain('c.status = ANY($5::varchar[])')
        expect(fixture.callRepository.manager.query.mock.calls[0][0]).toContain('LIMIT $6::int')
    })
})
