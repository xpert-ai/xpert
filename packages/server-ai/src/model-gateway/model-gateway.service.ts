import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import {
    AIPermissionsEnum,
    DEFAULT_MODEL_GATEWAY_BODY_RETENTION_DAYS,
    DEFAULT_MODEL_GATEWAY_CALL_RETENTION_DAYS,
    DEFAULT_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS,
    DEFAULT_MODEL_GATEWAY_REQUESTS_PER_MINUTE,
    ILLMUsage,
    IModelAccessResolution,
    IModelGatewayAdminSettings,
    IModelGatewayApiKey,
    IModelGatewayApiKeyCreated,
    MAX_MODEL_GATEWAY_CALL_RETENTION_DAYS,
    MAX_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS,
    MAX_MODEL_GATEWAY_REQUESTS_PER_MINUTE,
    MIN_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS,
    MIN_MODEL_GATEWAY_REQUESTS_PER_MINUTE,
    ModelAccessUnavailableReasonEnum,
    ModelGatewayApiKeyLifetimeEnum,
    ModelGatewayApiKeyStatusEnum,
    ModelGatewayCallStatusEnum,
    ModelGatewayUsageSourceEnum,
    MODEL_GATEWAY_CALL_RETENTION_DAYS_SETTING,
    MODEL_GATEWAY_CALL_RETENTION_ENABLED_SETTING,
    MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS_SETTING,
    MODEL_GATEWAY_REQUESTS_PER_MINUTE_SETTING,
    TModelGatewaySettingsUpdateInput,
    UserType
} from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import { decryptSecret, encryptSecret, RequestContext, TenantSetting, User } from '@xpert-ai/server-core'
import { getErrorMessage } from '@xpert-ai/server-common'
import {
    BadRequestException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
    NotFoundException,
    UnauthorizedException
} from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
    Brackets,
    DataSource,
    In,
    LessThanOrEqual,
    MoreThanOrEqual,
    ObjectLiteral,
    Repository,
    SelectQueryBuilder
} from 'typeorm'
import { MembershipService } from '../membership/membership.service'
import { ModelAccessService } from '../model-access/model-access.service'
import { settleChargeToCny } from '../membership/model-billing'
import { AgentMiddlewareRuntimeService } from '../shared/agent/middleware-runtime.service'
import { ModelGatewayApiKey } from './model-gateway-api-key.entity'
import { ModelGatewayCall } from './model-gateway-call.entity'
import { ModelGatewayPublication } from './model-gateway-publication.entity'
import { ModelGatewaySettings } from './model-gateway-settings.entity'
import { modelGatewayMessage } from './model-gateway.i18n'

const DEFAULT_KEY_LIFETIME = ModelGatewayApiKeyLifetimeEnum.Days90
const KEY_PREFIX_LENGTH = 10
const MAX_PAGE_SIZE = 200
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const GATEWAY_MAINTENANCE_INTERVAL_MS = 5 * 60 * 1000
const STALE_CALL_AFTER_MS = 30 * 60 * 1000
const CALL_RETENTION_BATCH_SIZE = 1000
const CALL_RETENTION_MAX_BATCHES = 20
export const MODEL_GATEWAY_UPSTREAM_TIMEOUT_MS = STALE_CALL_AFTER_MS - 60 * 1000

export class ModelGatewayRequestLimitException extends HttpException {
    readonly openAICode = 'rate_limit_exceeded'

    constructor(
        message: string,
        readonly retryAfterSeconds: number
    ) {
        super(message, HttpStatus.TOO_MANY_REQUESTS)
    }
}

export type ModelGatewayIdentity = {
    apiKey: ModelGatewayApiKey
    user: User
}

export type ModelGatewayUsage = {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    source: ModelGatewayUsageSourceEnum
    priceAmount?: number | null
    priceCurrency?: string | null
    settlementAmount?: number | null
    settlementCurrency?: string | null
    exchangeRate?: number | null
}

@Injectable()
export class ModelGatewayService {
    private readonly logger = new Logger(ModelGatewayService.name)

    constructor(
        @InjectRepository(ModelGatewayPublication)
        private readonly publicationRepository: Repository<ModelGatewayPublication>,
        @InjectRepository(ModelGatewayApiKey)
        private readonly apiKeyRepository: Repository<ModelGatewayApiKey>,
        @InjectRepository(ModelGatewaySettings)
        private readonly settingsRepository: Repository<ModelGatewaySettings>,
        @InjectRepository(ModelGatewayCall)
        private readonly callRepository: Repository<ModelGatewayCall>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(TenantSetting)
        private readonly tenantSettingRepository: Repository<TenantSetting>,
        private readonly modelAccessService: ModelAccessService,
        private readonly membershipService: MembershipService,
        private readonly runtimeService: AgentMiddlewareRuntimeService,
        @InjectDataSource()
        private readonly dataSource: DataSource
    ) {}

    async getSettings(): Promise<IModelGatewayAdminSettings> {
        const tenantId = this.requireTenantScope()
        const [settings, limits] = await Promise.all([
            this.getOrCreateSettings(tenantId),
            this.getAdmissionLimits(tenantId)
        ])
        return {
            ...settings,
            ...limits
        }
    }

    async updateSettings(input: TModelGatewaySettingsUpdateInput): Promise<IModelGatewayAdminSettings> {
        const tenantId = this.requireTenantScope()
        const settings = await this.getOrCreateSettings(tenantId)
        settings.storeBodies = input.storeBodies
        settings.bodyRetentionDays = input.bodyRetentionDays ?? settings.bodyRetentionDays
        const [saved] = await Promise.all([
            this.settingsRepository.save(settings),
            this.saveAdmissionLimits(tenantId, input)
        ])
        return {
            ...saved,
            requestsPerMinute: input.requestsPerMinute,
            maxConcurrentRequests: input.maxConcurrentRequests
        }
    }

    async listMyKeys() {
        const scope = this.currentScope()
        const userId = this.requireUserId()
        await this.expireDueApiKeys(scope.tenantId)
        const query = this.apiKeyRepository
            .createQueryBuilder('apiKey')
            .addSelect('apiKey.encryptedSecret')
            .where('apiKey.tenantId = :tenantId', { tenantId: scope.tenantId })
            .andWhere('apiKey.userId = :userId', { userId })
            .orderBy('apiKey.createdAt', 'DESC')
        this.applyScopeFilter(query, 'apiKey.organizationId', scope.organizationId)
        const keys = await query.getMany()
        return keys.map((key) =>
            this.toPublicApiKey(
                key,
                key.encryptedSecret ? decryptSecret(key.encryptedSecret, environment.secretsEncryptionKey) : undefined
            )
        )
    }

    async createKey(nameValue: string, lifetime = DEFAULT_KEY_LIFETIME): Promise<IModelGatewayApiKeyCreated> {
        const scope = this.currentScope()
        const user = await this.requireCurrentEligibleUser(scope)
        const name = nameValue.trim()
        if (!name) {
            throw new BadRequestException(
                modelGatewayMessage('ModelGatewayApiKeyNameRequired', 'API key name is required.')
            )
        }
        const random = randomBytes(32).toString('base64url')
        const prefix = random.slice(0, KEY_PREFIX_LENGTH)
        const secret = `sk-xpert-${prefix}-${random}`
        const key = this.apiKeyRepository.create({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            userId: user.id,
            name,
            prefix: `sk-xpert-${prefix}`,
            tokenHash: this.hashToken(secret),
            encryptedSecret: encryptSecret(secret, environment.secretsEncryptionKey),
            status: ModelGatewayApiKeyStatusEnum.Active,
            validUntil: this.resolveKeyExpiration(lifetime)
        })
        const saved = await this.apiKeyRepository.save(key)
        return { ...this.toPublicApiKey(saved), secret }
    }

    async revokeMyKey(id: string, reason?: string | null) {
        const scope = this.currentScope()
        const userId = this.requireUserId()
        const query = this.apiKeyRepository
            .createQueryBuilder('apiKey')
            .where('apiKey.tenantId = :tenantId', { tenantId: scope.tenantId })
            .andWhere('apiKey.userId = :userId', { userId })
            .andWhere('apiKey.id = :id', { id })
        this.applyScopeFilter(query, 'apiKey.organizationId', scope.organizationId)
        const key = await query.getOne()
        if (!key) {
            throw new NotFoundException(modelGatewayMessage('ModelGatewayApiKeyNotFound', 'API key not found.'))
        }
        return this.revokeKeyRecord(key, userId, reason)
    }

    async revokeOrganizationKeysForRemovedUser(input: { tenantId: string; organizationId: string; userId: string }) {
        return this.apiKeyRepository.update(
            {
                tenantId: input.tenantId,
                organizationId: input.organizationId,
                userId: input.userId,
                status: ModelGatewayApiKeyStatusEnum.Active
            },
            {
                status: ModelGatewayApiKeyStatusEnum.Revoked,
                revokedAt: new Date(),
                revokedById: null,
                revokeReason: modelGatewayMessage(
                    'ModelAccessUserLeftOrganizationReason',
                    'User left the organization.'
                )
            }
        )
    }

    async listAdminKeys(query?: {
        search?: string
        status?: ModelGatewayApiKeyStatusEnum
        userId?: string
        take?: number
        skip?: number
    }) {
        const scope = this.currentScope()
        await this.expireDueApiKeys(scope.tenantId)
        const qb = this.apiKeyRepository
            .createQueryBuilder('apiKey')
            .where('apiKey.tenantId = :tenantId', { tenantId: scope.tenantId })
            .orderBy('apiKey.createdAt', 'DESC')
            .take(this.pageSize(query?.take))
            .skip(this.pageOffset(query?.skip))
        this.applyScopeFilter(qb, 'apiKey.organizationId', scope.organizationId)
        if (query?.userId) {
            qb.andWhere('apiKey.userId = :userId', { userId: query.userId })
        }
        if (query?.search?.trim()) {
            qb.andWhere(
                '(LOWER(apiKey.name) LIKE :search OR LOWER(apiKey.prefix) LIKE :search OR CAST(apiKey.userId AS TEXT) LIKE :search)',
                {
                    search: `%${query.search.trim().toLowerCase()}%`
                }
            )
        }
        if (query?.status) {
            qb.andWhere('apiKey.status = :status', { status: query.status })
        }
        const [items, total] = await qb.getManyAndCount()
        return {
            items: await this.attachUserNames(scope.tenantId, items),
            total
        }
    }

    async revokeAdminKey(id: string, reason?: string | null) {
        const scope = this.currentScope()
        const query = this.apiKeyRepository
            .createQueryBuilder('apiKey')
            .where('apiKey.tenantId = :tenantId', { tenantId: scope.tenantId })
            .andWhere('apiKey.id = :id', { id })
        this.applyScopeFilter(query, 'apiKey.organizationId', scope.organizationId)
        const key = await query.getOne()
        if (!key) {
            throw new NotFoundException(modelGatewayMessage('ModelGatewayApiKeyNotFound', 'API key not found.'))
        }
        return this.revokeKeyRecord(key, this.requireUserId(), reason)
    }

    async authenticate(authorization?: string): Promise<ModelGatewayIdentity> {
        const token = this.readBearerToken(authorization)
        const tokenHash = this.hashToken(token)
        const key = await this.apiKeyRepository
            .createQueryBuilder('apiKey')
            .addSelect('apiKey.tokenHash')
            .where('apiKey.tokenHash = :tokenHash', { tokenHash })
            .getOne()
        if (
            key?.status === ModelGatewayApiKeyStatusEnum.Active &&
            key.validUntil &&
            key.validUntil.getTime() <= Date.now()
        ) {
            key.status = ModelGatewayApiKeyStatusEnum.Expired
            await this.apiKeyRepository.save(key)
        }
        if (!key || key.status !== ModelGatewayApiKeyStatusEnum.Active) {
            throw new UnauthorizedException(
                modelGatewayMessage('ModelGatewayApiKeyInvalid', 'Invalid or expired API key.')
            )
        }
        const user = await this.userRepository.findOne({
            where: { tenantId: key.tenantId, id: key.userId },
            relations: ['role', 'role.rolePermissions']
        })
        if (!user) {
            throw new UnauthorizedException(
                modelGatewayMessage('ModelGatewayApiKeyOwnerMissing', 'API key owner no longer exists.')
            )
        }
        key.lastUsedAt = new Date()
        await this.apiKeyRepository.save(key)
        return { apiKey: key, user }
    }

    async listAccessiblePublications(identity: ModelGatewayIdentity) {
        const publicationQuery = this.publicationRepository
            .createQueryBuilder('publication')
            .where('publication.tenantId = :tenantId', { tenantId: identity.apiKey.tenantId })
            .orderBy('publication.externalModelId', 'ASC')
        this.applyVisibleScopeFilter(
            publicationQuery,
            'publication.organizationId',
            identity.apiKey.organizationId ?? null
        )
        const publications = await publicationQuery.getMany()
        const accessible: Array<{
            publication: ModelGatewayPublication
            resolution: IModelAccessResolution
        }> = []
        for (const publication of publications) {
            const resolution = await this.modelAccessService.resolveExternalModelAccess({
                tenantId: identity.apiKey.tenantId,
                organizationId: identity.apiKey.organizationId ?? null,
                userId: identity.user.id,
                publicationId: publication.id
            })
            if (
                resolution.grantId &&
                (resolution.allowed || resolution.unavailableReason === ModelAccessUnavailableReasonEnum.QuotaExhausted)
            ) {
                accessible.push({ publication, resolution })
            }
        }
        return accessible
    }

    async requireCallablePublication(identity: ModelGatewayIdentity, externalModelId: string) {
        const publicationQuery = this.publicationRepository
            .createQueryBuilder('publication')
            .where('publication.tenantId = :tenantId', { tenantId: identity.apiKey.tenantId })
            .andWhere('publication.externalModelId = :externalModelId', { externalModelId })
        this.applyVisibleScopeFilter(
            publicationQuery,
            'publication.organizationId',
            identity.apiKey.organizationId ?? null
        )
        const publication = await publicationQuery.getOne()
        if (!publication) {
            throw new NotFoundException(
                modelGatewayMessage('ModelGatewayModelNotFound', "Model '{{model}}' was not found.", {
                    model: externalModelId
                })
            )
        }
        const resolution = await this.modelAccessService.resolveExternalModelAccess({
            tenantId: identity.apiKey.tenantId,
            organizationId: identity.apiKey.organizationId ?? null,
            userId: identity.user.id,
            publicationId: publication.id
        })
        if (!resolution.allowed) {
            if (
                resolution.unavailableReason === ModelAccessUnavailableReasonEnum.QuotaExhausted ||
                resolution.unavailableReason === ModelAccessUnavailableReasonEnum.MembershipRequired
            ) {
                throw new HttpException(
                    modelGatewayMessage('ModelGatewayNoRemainingPoints', 'The API key owner has no remaining points.'),
                    HttpStatus.TOO_MANY_REQUESTS
                )
            }
            throw new ForbiddenException(
                modelGatewayMessage(
                    'ModelGatewayModelNotCallable',
                    'The API key owner cannot use this model or has no remaining points.'
                )
            )
        }
        return { publication, resolution }
    }

    async createChatModel(
        publication: ModelGatewayPublication,
        resolution: IModelAccessResolution,
        usageCallback: (usage: ILLMUsage) => void
    ) {
        const client = await this.runtimeService.createModelClient<BaseChatModel>(
            {
                copilotId: publication.copilotId,
                model: publication.copilotModelId,
                modelType: publication.modelType
            },
            {
                usageCallback,
                modelAccessOverride: resolution,
                skipTokenRecord: true
            },
            {
                tenantId: publication.tenantId,
                organizationId: publication.organizationId ?? null,
                userId: resolution.billableUserId
            }
        )
        if (!client || typeof client.invoke !== 'function' || typeof client.stream !== 'function') {
            throw new BadRequestException(
                modelGatewayMessage('ModelGatewaySourceNotChat', 'Published source is not a chat model.')
            )
        }
        return client
    }

    async startCall(input: {
        identity: ModelGatewayIdentity
        publication: ModelGatewayPublication
        resolution: IModelAccessResolution
        requestBody: unknown
    }) {
        const requestId = randomUUID()
        const settings = await this.getOrCreateSettings(input.identity.apiKey.tenantId)
        const limits = await this.getAdmissionLimits(input.identity.apiKey.tenantId)
        const startedAt = new Date()
        return this.dataSource.transaction(async (manager) => {
            const lockedUser = await manager.findOne(User, {
                where: {
                    tenantId: input.identity.apiKey.tenantId,
                    id: input.identity.user.id
                },
                select: { id: true },
                lock: { mode: 'pessimistic_write' }
            })
            if (!lockedUser) {
                throw new UnauthorizedException(
                    modelGatewayMessage('ModelGatewayApiKeyOwnerMissing', 'API key owner no longer exists.')
                )
            }

            const repository = manager.getRepository(ModelGatewayCall)
            const callsInWindow = await repository.count({
                where: {
                    tenantId: input.identity.apiKey.tenantId,
                    userId: input.identity.user.id,
                    startedAt: MoreThanOrEqual(new Date(startedAt.getTime() - RATE_LIMIT_WINDOW_MS))
                }
            })
            if (callsInWindow >= limits.requestsPerMinute) {
                throw new ModelGatewayRequestLimitException(
                    modelGatewayMessage(
                        'ModelGatewayRateLimitExceeded',
                        'The API request rate limit has been reached.'
                    ),
                    Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)
                )
            }

            const activeCalls = await repository.count({
                where: {
                    tenantId: input.identity.apiKey.tenantId,
                    userId: input.identity.user.id,
                    status: ModelGatewayCallStatusEnum.Started,
                    startedAt: MoreThanOrEqual(new Date(startedAt.getTime() - STALE_CALL_AFTER_MS))
                }
            })
            if (activeCalls >= limits.maxConcurrentRequests) {
                throw new ModelGatewayRequestLimitException(
                    modelGatewayMessage(
                        'ModelGatewayConcurrencyLimitExceeded',
                        'The maximum number of concurrent API requests has been reached.'
                    ),
                    1
                )
            }

            return repository.save(
                repository.create({
                    tenantId: input.identity.apiKey.tenantId,
                    organizationId: input.identity.apiKey.organizationId ?? null,
                    requestId,
                    userId: input.identity.user.id,
                    apiKeyId: input.identity.apiKey.id,
                    publicationId: input.publication.id,
                    externalModelId: input.publication.externalModelId,
                    provider: input.publication.provider,
                    model: input.publication.model,
                    status: ModelGatewayCallStatusEnum.Started,
                    startedAt,
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: 0,
                    chargedPoints: 0,
                    excessPoints: 0,
                    usageSource: ModelGatewayUsageSourceEnum.None,
                    settlementContext: input.resolution,
                    encryptedRequest: settings.storeBodies ? this.encryptBody(input.requestBody) : null,
                    bodyExpiresAt: settings.storeBodies
                        ? new Date(startedAt.getTime() + settings.bodyRetentionDays * 24 * 60 * 60 * 1000)
                        : null
                })
            )
        })
    }

    async finishCall(input: {
        call: ModelGatewayCall
        resolution: IModelAccessResolution
        usage: ModelGatewayUsage
        responseBody?: unknown
        error?: unknown
    }) {
        const current = await this.callRepository.findOne({
            where: { requestId: input.call.requestId }
        })
        if (
            !current ||
            ![ModelGatewayCallStatusEnum.Started, ModelGatewayCallStatusEnum.SettlementPending].includes(current.status)
        ) {
            return current
        }
        const retryingSettlement = current.status === ModelGatewayCallStatusEnum.SettlementPending
        const cnySettlement =
            input.usage.settlementAmount === undefined || input.usage.settlementAmount === null
                ? settleChargeToCny({
                      pricingStatus:
                          input.usage.priceAmount === undefined
                              ? 'unpriced'
                              : input.usage.priceAmount === 0
                                ? 'free'
                                : 'priced',
                      amount: input.usage.priceAmount,
                      currency: input.usage.priceCurrency
                  })
                : {
                      amount: input.usage.settlementAmount,
                      currency: 'CNY' as const,
                      exchangeRate: input.usage.exchangeRate ?? null
                  }
        input.usage.settlementAmount = cnySettlement?.amount ?? null
        input.usage.settlementCurrency = cnySettlement?.currency ?? null
        input.usage.exchangeRate = cnySettlement?.exchangeRate ?? null
        const settlementResult = await this.membershipService.recordGatewayUsage({
            tenantId: current.tenantId,
            organizationId: current.organizationId ?? null,
            copilotOrganizationId: input.resolution.organizationId ?? null,
            userId: current.userId,
            provider: current.provider,
            model: current.model,
            tokenUsed: input.usage.totalTokens,
            priceAmount: input.usage.priceAmount,
            priceCurrency: input.usage.priceCurrency,
            settlementAmount: cnySettlement?.amount,
            settlementCurrency: cnySettlement?.currency,
            exchangeRate: cnySettlement?.exchangeRate,
            copilotId: input.resolution.copilotId,
            modelAccess: input.resolution,
            gatewayRequestId: current.requestId,
            gatewayApiKeyId: current.apiKeyId
        })
        const completedAt = retryingSettlement && current.completedAt ? current.completedAt : new Date()
        current.status = retryingSettlement
            ? current.errorCode
                ? ModelGatewayCallStatusEnum.Failed
                : ModelGatewayCallStatusEnum.Succeeded
            : input.error
              ? ModelGatewayCallStatusEnum.Failed
              : ModelGatewayCallStatusEnum.Succeeded
        current.completedAt = completedAt
        current.durationMs = Math.max(0, completedAt.getTime() - current.startedAt.getTime())
        current.inputTokens = input.usage.inputTokens
        current.outputTokens = input.usage.outputTokens
        current.totalTokens = input.usage.totalTokens
        current.priceAmount = input.usage.priceAmount ?? null
        current.priceCurrency = input.usage.priceCurrency ?? null
        current.settlementAmount = cnySettlement?.amount ?? null
        current.settlementCurrency = cnySettlement?.currency ?? null
        current.exchangeRate = cnySettlement?.exchangeRate ?? null
        current.chargedPoints = settlementResult.chargedPoints
        current.excessPoints = settlementResult.excessPoints
        current.usageSource = input.usage.source
        current.settlementContext = null
        if (!retryingSettlement) {
            current.errorCode = input.error ? this.errorCode(input.error) : null
            current.errorMessage = input.error ? getErrorMessage(input.error).slice(0, 4000) : null
        }
        if (current.bodyExpiresAt && input.responseBody !== undefined) {
            current.encryptedResponse = this.encryptBody(input.responseBody)
        }
        return this.callRepository.save(current)
    }

    async recordSettlementFailure(
        call: ModelGatewayCall,
        usage: ModelGatewayUsage,
        settlementError: unknown,
        outcome?: { error?: unknown; responseBody?: unknown }
    ) {
        this.logger.error(
            `Model gateway settlement failed for request ${call.requestId}: ${getErrorMessage(settlementError)}`
        )
        try {
            const current = await this.callRepository.findOne({
                where: { requestId: call.requestId }
            })
            if (!current || current.status !== ModelGatewayCallStatusEnum.Started) {
                return current
            }
            const completedAt = new Date()
            current.status = ModelGatewayCallStatusEnum.SettlementPending
            current.completedAt = completedAt
            current.durationMs = Math.max(0, completedAt.getTime() - current.startedAt.getTime())
            current.inputTokens = usage.inputTokens
            current.outputTokens = usage.outputTokens
            current.totalTokens = usage.totalTokens
            current.priceAmount = usage.priceAmount ?? null
            current.priceCurrency = usage.priceCurrency ?? null
            current.settlementAmount = usage.settlementAmount ?? null
            current.settlementCurrency = usage.settlementCurrency ?? null
            current.exchangeRate = usage.exchangeRate ?? null
            current.usageSource = usage.source
            current.errorCode = outcome?.error ? this.errorCode(outcome.error) : null
            current.errorMessage = outcome?.error ? getErrorMessage(outcome.error).slice(0, 4000) : null
            if (current.bodyExpiresAt && outcome?.responseBody !== undefined) {
                current.encryptedResponse = this.encryptBody(outcome.responseBody)
            }
            return await this.callRepository.save(current)
        } catch (persistenceError) {
            this.logger.error(
                `Failed to persist settlement retry for request ${call.requestId}: ${getErrorMessage(persistenceError)}`
            )
            return null
        }
    }

    @Interval(GATEWAY_MAINTENANCE_INTERVAL_MS)
    async retryPendingSettlements() {
        const calls = await this.callRepository
            .createQueryBuilder('call')
            .addSelect('call.settlementContext')
            .where('call.status = :status', { status: ModelGatewayCallStatusEnum.SettlementPending })
            .orderBy('call.createdAt', 'ASC')
            .take(100)
            .getMany()
        let settled = 0
        for (const call of calls) {
            try {
                const resolution =
                    call.settlementContext ??
                    (await this.modelAccessService.resolveExternalModelAccess({
                        tenantId: call.tenantId,
                        organizationId: call.organizationId ?? null,
                        userId: call.userId,
                        publicationId: call.publicationId
                    }))
                const result = await this.finishCall({
                    call,
                    resolution,
                    usage: {
                        inputTokens: call.inputTokens,
                        outputTokens: call.outputTokens,
                        totalTokens: call.totalTokens,
                        source: call.usageSource,
                        priceAmount: call.priceAmount,
                        priceCurrency: call.priceCurrency,
                        settlementAmount: call.settlementAmount,
                        settlementCurrency: call.settlementCurrency,
                        exchangeRate: call.exchangeRate
                    }
                })
                if (result?.status !== ModelGatewayCallStatusEnum.SettlementPending) {
                    settled += 1
                }
            } catch (error) {
                this.logger.error(
                    `Model gateway settlement retry failed for request ${call.requestId}: ${getErrorMessage(error)}`
                )
            }
        }
        if (settled) {
            this.logger.log(`Retried ${settled} pending model gateway settlement(s).`)
        }
        return { scanned: calls.length, settled }
    }

    async listMyCalls(take?: number, skip?: number) {
        const scope = this.currentScope()
        const userId = this.requireUserId()
        return this.listCalls({ ...scope, userId, take, skip })
    }

    async listAdminCalls(query?: {
        search?: string
        status?: ModelGatewayCallStatusEnum
        userId?: string
        take?: number
        skip?: number
    }) {
        const scope = this.currentScope()
        const page = await this.listCalls({
            ...scope,
            search: query?.search,
            status: query?.status,
            userId: query?.userId,
            take: query?.take,
            skip: query?.skip
        })
        return {
            ...page,
            items: await this.attachUserNames(scope.tenantId, page.items)
        }
    }

    async getAdminCallBody(id: string) {
        const scope = this.currentScope()
        const query = this.callRepository
            .createQueryBuilder('call')
            .addSelect(['call.encryptedRequest', 'call.encryptedResponse'])
            .where('call.tenantId = :tenantId', { tenantId: scope.tenantId })
            .andWhere('call.id = :id', { id })
        this.applyScopeFilter(query, 'call.organizationId', scope.organizationId)
        const call = await query.getOne()
        if (!call) {
            throw new NotFoundException(modelGatewayMessage('ModelGatewayCallNotFound', 'Gateway call was not found.'))
        }
        return {
            request: this.decryptBody(call.encryptedRequest),
            response: this.decryptBody(call.encryptedResponse),
            expiresAt: call.bodyExpiresAt ?? null
        }
    }

    @Interval(60 * 60 * 1000)
    async purgeExpiredBodies() {
        await this.callRepository
            .createQueryBuilder()
            .update(ModelGatewayCall)
            .set({ encryptedRequest: null, encryptedResponse: null, bodyExpiresAt: null })
            .where({ bodyExpiresAt: LessThanOrEqual(new Date()) })
            .execute()
    }

    @Interval(60 * 60 * 1000)
    async purgeExpiredCalls() {
        let deleted = 0
        let batches = 0
        let batchLimitReached = false

        while (batches < CALL_RETENTION_MAX_BATCHES) {
            const rows = await this.callRepository.manager.query(buildCallRetentionSql(), [
                MODEL_GATEWAY_CALL_RETENTION_ENABLED_SETTING,
                MODEL_GATEWAY_CALL_RETENTION_DAYS_SETTING,
                DEFAULT_MODEL_GATEWAY_CALL_RETENTION_DAYS,
                MAX_MODEL_GATEWAY_CALL_RETENTION_DAYS,
                [ModelGatewayCallStatusEnum.Succeeded, ModelGatewayCallStatusEnum.Failed],
                CALL_RETENTION_BATCH_SIZE
            ])
            const batchDeleted = readDeletedCount(rows)
            if (!batchDeleted) {
                break
            }

            deleted += batchDeleted
            batches += 1
            if (batchDeleted < CALL_RETENTION_BATCH_SIZE) {
                break
            }
        }
        batchLimitReached = batches === CALL_RETENTION_MAX_BATCHES

        if (deleted) {
            this.logger.log(`Purged ${deleted} expired model gateway call record(s) in ${batches} batch(es).`)
        }
        return { deleted, batches, batchLimitReached }
    }

    @Interval(GATEWAY_MAINTENANCE_INTERVAL_MS)
    async expireDueApiKeys(tenantId?: string) {
        return this.apiKeyRepository
            .createQueryBuilder()
            .update(ModelGatewayApiKey)
            .set({ status: ModelGatewayApiKeyStatusEnum.Expired })
            .where({
                status: ModelGatewayApiKeyStatusEnum.Active,
                validUntil: LessThanOrEqual(new Date()),
                ...(tenantId ? { tenantId } : {})
            })
            .execute()
    }

    @Interval(GATEWAY_MAINTENANCE_INTERVAL_MS)
    async failStaleCalls() {
        const result = await this.callRepository
            .createQueryBuilder()
            .update(ModelGatewayCall)
            .set({
                status: ModelGatewayCallStatusEnum.Failed,
                completedAt: new Date(),
                errorCode: 'gateway_interrupted',
                errorMessage: modelGatewayMessage(
                    'ModelGatewayCallInterrupted',
                    'The gateway process ended before this call could be finalized.'
                )
            })
            .where({
                status: ModelGatewayCallStatusEnum.Started,
                startedAt: LessThanOrEqual(new Date(Date.now() - STALE_CALL_AFTER_MS))
            })
            .execute()
        if (result.affected) {
            this.logger.warn(`Marked ${result.affected} stale model gateway call(s) as failed.`)
        }
        return result
    }

    private async listCalls(input: {
        tenantId: string
        organizationId: string | null
        userId?: string
        search?: string
        status?: ModelGatewayCallStatusEnum
        take?: number
        skip?: number
    }) {
        const qb = this.callRepository
            .createQueryBuilder('call')
            .where('call.tenantId = :tenantId', { tenantId: input.tenantId })
            .orderBy('call.createdAt', 'DESC')
            .take(this.pageSize(input.take))
            .skip(this.pageOffset(input.skip))
        this.applyScopeFilter(qb, 'call.organizationId', input.organizationId)
        if (input.userId) {
            qb.andWhere('call.userId = :userId', { userId: input.userId })
        }
        if (input.search?.trim()) {
            qb.andWhere(
                new Brackets((searchQb) => {
                    searchQb
                        .where('LOWER(call.externalModelId) LIKE :search')
                        .orWhere('LOWER(call.provider) LIKE :search')
                        .orWhere('LOWER(call.model) LIKE :search')
                        .orWhere('CAST(call.requestId AS TEXT) LIKE :search')
                        .orWhere('CAST(call.userId AS TEXT) LIKE :search')
                }),
                { search: `%${input.search.trim().toLowerCase()}%` }
            )
        }
        if (input.status) {
            qb.andWhere('call.status = :status', { status: input.status })
        }
        const [items, total] = await qb.getManyAndCount()
        return { items, total }
    }

    private async attachUserNames<T extends { userId: string }>(tenantId: string, items: T[]) {
        if (!items.length) {
            return []
        }
        const userIds = Array.from(new Set(items.map((item) => item.userId)))
        const users = await this.userRepository.find({
            where: {
                tenantId,
                id: In(userIds)
            }
        })
        const names = new Map(users.map((user) => [user.id, this.userName(user)]))
        return items.map((item) => ({
            ...item,
            userName: names.get(item.userId) ?? item.userId
        }))
    }

    private userName(user: User) {
        return (
            user.name?.trim() ||
            [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
            user.email?.trim() ||
            user.username?.trim() ||
            user.id
        )
    }

    private async getOrCreateSettings(tenantId: string) {
        const existing = await this.settingsRepository.findOne({ where: { tenantId } })
        if (existing) {
            return existing
        }
        try {
            return await this.settingsRepository.save(
                this.settingsRepository.create({
                    tenantId,
                    storeBodies: false,
                    bodyRetentionDays: DEFAULT_MODEL_GATEWAY_BODY_RETENTION_DAYS
                })
            )
        } catch (error) {
            if (this.isUniqueViolation(error)) {
                return this.settingsRepository.findOneOrFail({ where: { tenantId } })
            }
            throw error
        }
    }

    private async getAdmissionLimits(tenantId: string) {
        const settings = await this.tenantSettingRepository.find({
            where: {
                tenantId,
                name: In([MODEL_GATEWAY_REQUESTS_PER_MINUTE_SETTING, MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS_SETTING])
            }
        })
        const byName = new Map(settings.map((setting) => [setting.name, setting.value]))
        return {
            requestsPerMinute: this.parseBoundedInteger(
                byName.get(MODEL_GATEWAY_REQUESTS_PER_MINUTE_SETTING),
                DEFAULT_MODEL_GATEWAY_REQUESTS_PER_MINUTE,
                MIN_MODEL_GATEWAY_REQUESTS_PER_MINUTE,
                MAX_MODEL_GATEWAY_REQUESTS_PER_MINUTE
            ),
            maxConcurrentRequests: this.parseBoundedInteger(
                byName.get(MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS_SETTING),
                DEFAULT_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS,
                MIN_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS,
                MAX_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS
            )
        }
    }

    private async saveAdmissionLimits(
        tenantId: string,
        input: Pick<TModelGatewaySettingsUpdateInput, 'requestsPerMinute' | 'maxConcurrentRequests'>
    ) {
        const values = [
            {
                name: MODEL_GATEWAY_REQUESTS_PER_MINUTE_SETTING,
                value: String(input.requestsPerMinute)
            },
            {
                name: MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS_SETTING,
                value: String(input.maxConcurrentRequests)
            }
        ]
        const existing = await this.tenantSettingRepository.find({
            where: {
                tenantId,
                name: In(values.map(({ name }) => name))
            }
        })
        const settings = values.map(({ name, value }) => {
            const setting =
                existing.find((item) => item.name === name) ?? this.tenantSettingRepository.create({ tenantId, name })
            setting.value = value
            return setting
        })
        await this.tenantSettingRepository.save(settings)
    }

    private async requireCurrentEligibleUser(scope: { tenantId: string; organizationId: string | null }) {
        if (!(await this.modelAccessService.isModelGatewayFeatureEnabled(scope))) {
            throw new ForbiddenException(
                modelGatewayMessage('ModelGatewayFeatureDisabled', 'External model API access is disabled.')
            )
        }
        const userId = this.requireUserId()
        const user = await this.userRepository.findOne({
            where: { tenantId: scope.tenantId, id: userId },
            relations: ['role', 'role.rolePermissions']
        })
        if (
            !user ||
            user.type === UserType.COMMUNICATION ||
            !user.role?.rolePermissions?.some(
                (permission) => permission.enabled && permission.permission === AIPermissionsEnum.MODEL_GATEWAY_USE
            )
        ) {
            throw new ForbiddenException(
                modelGatewayMessage(
                    'ModelGatewayPermissionRequired',
                    'Your role is not allowed to use the external model API.'
                )
            )
        }
        return user
    }

    private revokeKeyRecord(key: ModelGatewayApiKey, actorId: string, reason?: string | null) {
        if (key.status === ModelGatewayApiKeyStatusEnum.Revoked) {
            return key
        }
        key.status = ModelGatewayApiKeyStatusEnum.Revoked
        key.revokedAt = new Date()
        key.revokedById = actorId
        key.revokeReason = reason?.trim() || null
        return this.apiKeyRepository.save(key)
    }

    private resolveKeyExpiration(lifetime: ModelGatewayApiKeyLifetimeEnum) {
        if (lifetime === ModelGatewayApiKeyLifetimeEnum.Permanent) {
            return null
        }
        const days = {
            [ModelGatewayApiKeyLifetimeEnum.Days30]: 30,
            [ModelGatewayApiKeyLifetimeEnum.Days90]: 90,
            [ModelGatewayApiKeyLifetimeEnum.Days180]: 180
        }[lifetime]
        if (!days) {
            throw new BadRequestException(
                modelGatewayMessage('ModelGatewayKeyLifetimeUnsupported', 'Unsupported API key lifetime.')
            )
        }
        return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    }

    private toPublicApiKey(key: ModelGatewayApiKey, secret?: string): IModelGatewayApiKey {
        return {
            id: key.id,
            createdById: key.createdById,
            updatedById: key.updatedById,
            createdAt: key.createdAt,
            updatedAt: key.updatedAt,
            tenantId: key.tenantId,
            organizationId: key.organizationId,
            userId: key.userId,
            name: key.name,
            prefix: key.prefix,
            ...(secret ? { secret } : {}),
            status: key.status,
            validUntil: key.validUntil,
            lastUsedAt: key.lastUsedAt,
            revokedAt: key.revokedAt,
            revokedById: key.revokedById,
            revokeReason: key.revokeReason
        }
    }

    private readBearerToken(authorization?: string) {
        const match = authorization?.match(/^Bearer\s+(\S+)$/i)
        if (!match) {
            throw new UnauthorizedException(
                modelGatewayMessage('ModelGatewayBearerRequired', 'A Bearer API key is required.')
            )
        }
        return match[1]
    }

    private hashToken(token: string) {
        return createHash('sha256').update(token).digest('hex')
    }

    private encryptBody(body: unknown) {
        return encryptSecret(JSON.stringify(body), environment.secretsEncryptionKey)
    }

    private decryptBody(ciphertext?: string | null) {
        if (!ciphertext) {
            return null
        }
        const body: unknown = JSON.parse(decryptSecret(ciphertext, environment.secretsEncryptionKey))
        return body
    }

    private errorCode(error: unknown) {
        if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
            return error.code.slice(0, 100)
        }
        return 'gateway_error'
    }

    private currentScope() {
        return {
            tenantId: this.requireTenant(),
            organizationId: RequestContext.getOrganizationId()
        }
    }

    private applyScopeFilter<T extends ObjectLiteral>(
        query: SelectQueryBuilder<T>,
        field: string,
        organizationId: string | null
    ) {
        return organizationId
            ? query.andWhere(`${field} = :scopeOrganizationId`, { scopeOrganizationId: organizationId })
            : query.andWhere(`${field} IS NULL`)
    }

    private applyVisibleScopeFilter<T extends ObjectLiteral>(
        query: SelectQueryBuilder<T>,
        field: string,
        organizationId: string | null
    ) {
        return organizationId
            ? query.andWhere(`(${field} IS NULL OR ${field} = :visibleOrganizationId)`, {
                  visibleOrganizationId: organizationId
              })
            : query.andWhere(`${field} IS NULL`)
    }

    private requireTenantScope() {
        const tenantId = this.requireTenant()
        if (!RequestContext.isTenantScope()) {
            throw new ForbiddenException(
                modelGatewayMessage('ModelGatewayTenantScopeRequired', 'Tenant scope is required.')
            )
        }
        return tenantId
    }

    private requireTenant() {
        const tenantId = RequestContext.currentTenantId()
        if (!tenantId) {
            throw new ForbiddenException(
                modelGatewayMessage('ModelGatewayTenantScopeRequired', 'Tenant scope is required.')
            )
        }
        return tenantId
    }

    private requireUserId() {
        const userId = RequestContext.currentUserId()
        if (!userId) {
            throw new ForbiddenException(
                modelGatewayMessage('ModelGatewayAuthenticatedUserRequired', 'Authenticated user is required.')
            )
        }
        return userId
    }

    private pageSize(value?: number) {
        return Math.min(Math.max(Number(value ?? 50), 1), MAX_PAGE_SIZE)
    }

    private pageOffset(value?: number) {
        return Math.max(Number(value ?? 0), 0)
    }

    private parseBoundedInteger(value: unknown, fallback: number, min: number, max: number) {
        const parsed = Number(value)
        return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback
    }

    private isUniqueViolation(error: unknown) {
        return (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            (error.code === '23505' || error.code === 'SQLITE_CONSTRAINT')
        )
    }
}

function buildCallRetentionSql() {
    return `
WITH candidates AS (
    SELECT c.id
    FROM model_gateway_call c
    JOIN tenant_setting te
        ON te."tenantId" IS NOT DISTINCT FROM c."tenantId"
        AND te.name = $1
        AND lower(COALESCE(te.value, '')) IN ('1', 'true', 'yes', 'on')
    LEFT JOIN tenant_setting td
        ON td."tenantId" IS NOT DISTINCT FROM c."tenantId"
        AND td.name = $2
    WHERE c.status = ANY($5::varchar[])
        AND COALESCE(c."completedAt", c."createdAt") < now() - make_interval(
            days => COALESCE(
                CASE
                    WHEN td.value ~ '^[1-9][0-9]{0,8}$' AND td.value::int <= $4::int THEN td.value::int
                END,
                $3::int
            )
        )
    ORDER BY COALESCE(c."completedAt", c."createdAt") ASC
    LIMIT $6::int
    FOR UPDATE OF c SKIP LOCKED
),
deleted AS (
    DELETE FROM model_gateway_call c
    USING candidates
    WHERE c.id = candidates.id
    RETURNING 1
)
SELECT count(*)::int AS count
FROM deleted
`
}

function readDeletedCount(rows: unknown): number {
    if (!Array.isArray(rows) || rows.length === 0) {
        return 0
    }
    const first = rows[0]
    if (!first || typeof first !== 'object' || !('count' in first)) {
        return 0
    }
    const value = first.count
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value
    }
    if (typeof value === 'string') {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : 0
    }
    return 0
}
