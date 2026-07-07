import { randomBytes, createHash } from 'crypto'
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { decryptSecret, encryptSecret, IntegrationService, RequestContext } from '@xpert-ai/server-core'
import { environment } from '@xpert-ai/server-config'
import { ConnectorStrategyRegistry } from '@xpert-ai/plugin-sdk'
import type {
    ConnectorAppIntegration,
    ConnectorAppIntegrationSelectOption,
    ConnectorAuthorizationPollResult,
    ConnectorDefinition,
    ConnectorInstance,
    ConnectorOAuthCompleteRequest,
    ConnectorOAuthCredential,
    ConnectorOAuthStatusResponse,
    ConnectorOAuthStartRequest,
    ConnectorOAuthStartResponse,
    ConnectorProfile,
    ConnectorRuntimeCredential,
    ConnectorRuntimeGetInput,
    ConnectorSelectOption,
    ConnectorStrategy,
    RuntimeI18nText
} from '@xpert-ai/plugin-sdk'
import { XpertWorkspaceAccessService } from '../workspace-access.service'
import { XpertWorkspaceConnectorOAuthSession } from './workspace-connector-oauth-session.entity'
import { XpertWorkspaceConnector } from './workspace-connector.entity'

type RepositoryWhere<T> = {
    where: Partial<T>
}

type ConnectorRepository<T extends { id?: string }> = {
    create(input: Partial<T>): T
    save(input: T): Promise<T>
    findOne(options: RepositoryWhere<T>): Promise<T | null>
    find(options?: RepositoryWhere<T>): Promise<T[]>
}

type WorkspaceConnectorRepository = ConnectorRepository<XpertWorkspaceConnector>
type OAuthSessionRepository = ConnectorRepository<XpertWorkspaceConnectorOAuthSession>

type WorkspaceConnectorAccessService = Pick<
    XpertWorkspaceAccessService,
    'assertCanRead' | 'assertCanManage' | 'assertCanRun'
>

type WorkspaceConnectorIntegrationService = Pick<IntegrationService, 'findOneByIdWithinTenant' | 'create' | 'findAll'>

type WorkspaceConnectorStrategyRegistry = Pick<ConnectorStrategyRegistry, 'get' | 'list'>

type ConnectorStrategyWithAppIntegrationSelector = ConnectorStrategy

type StartOAuthInput = ConnectorOAuthStartRequest & {
    redirectUri: string
}

type ConnectorAppOptions = Record<string, unknown>

type StoredConnectorCredential = ConnectorOAuthCredential & {
    app?: ConnectorAppOptions
}

type ConnectorProviderSelectOption = {
    value: string
    label: RuntimeI18nText
    description?: RuntimeI18nText
    icon?: ConnectorDefinition['icon']
}

const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000
const OAUTH_SESSION_EXPIRED_ERROR = 'Connector OAuth session has expired'

@Injectable()
export class XpertWorkspaceConnectorService {
    private readonly encryptionKey = environment.secretsEncryptionKey

    constructor(
        @InjectRepository(XpertWorkspaceConnector)
        private readonly connectorRepository: WorkspaceConnectorRepository,
        @InjectRepository(XpertWorkspaceConnectorOAuthSession)
        private readonly sessionRepository: OAuthSessionRepository,
        @Inject(XpertWorkspaceAccessService)
        private readonly workspaceAccessService: WorkspaceConnectorAccessService,
        @Inject(IntegrationService)
        private readonly integrationService: WorkspaceConnectorIntegrationService,
        @Inject(ConnectorStrategyRegistry)
        private readonly connectorStrategyRegistry: WorkspaceConnectorStrategyRegistry
    ) {}

    async list(workspaceId: string): Promise<ConnectorInstance[]> {
        await this.workspaceAccessService.assertCanRead(workspaceId)
        const tenantId = RequestContext.currentTenantId()
        const connectors = await this.connectorRepository.find({
            where: {
                tenantId,
                workspaceId
            }
        })
        return connectors.map((connector) => this.toPublicConnector(connector))
    }

    async definitions(workspaceId: string): Promise<ConnectorDefinition[]> {
        await this.workspaceAccessService.assertCanRead(workspaceId)
        const organizationId = RequestContext.getOrganizationId()
        return this.connectorStrategyRegistry.list(organizationId).map((strategy) => strategy.definition)
    }

    async providerOptions(workspaceId: string): Promise<ConnectorProviderSelectOption[]> {
        return (await this.definitions(workspaceId)).map((definition) => ({
            value: definition.provider,
            label: definition.label,
            description: definition.description,
            icon: definition.icon
        }))
    }

    async selectOptions(workspaceId: string, provider?: string): Promise<ConnectorSelectOption[]> {
        const organizationId = RequestContext.getOrganizationId()
        const definitions = new Map(
            this.connectorStrategyRegistry.list(organizationId).map((strategy) => [
                strategy.definition.provider,
                strategy.definition
            ])
        )

        return (await this.list(workspaceId))
            .filter((connector) => (!provider || connector.provider === provider) && connector.status === 'active')
            .map((connector) => ({
                value: connector.id,
                label: definitions.get(connector.provider)?.label ?? connector.provider,
                provider: connector.provider,
                status: connector.status,
                avatarUrl: connector.profile?.avatarUrl,
                description: connectorProfileDescription(connector.profile)
            }))
    }

    async appIntegrationSelectOptions(
        workspaceId: string,
        provider: string
    ): Promise<ConnectorAppIntegrationSelectOption[]> {
        await this.workspaceAccessService.assertCanRead(workspaceId)
        const organizationId = RequestContext.getOrganizationId()
        const strategy = this.connectorStrategyRegistry.get(provider, organizationId)

        if (!acceptsAppIntegrationReference(strategy.definition)) {
            return []
        }

        const appProvider = resolveAppIntegrationProvider(strategy.definition, provider)
        const { items } = await this.integrationService.findAll({ where: { provider: appProvider } })
        const options: ConnectorAppIntegrationSelectOption[] = []
        for (const item of items) {
            if (!(await isSelectableAppIntegration(strategy, item))) {
                continue
            }
            options.push({
                value: item.id,
                label: item.name,
                description: item.description
            })
        }
        return options
    }

    async startOAuth(
        workspaceId: string,
        provider: string,
        input: StartOAuthInput
    ): Promise<ConnectorOAuthStartResponse> {
        await this.workspaceAccessService.assertCanManage(workspaceId)

        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const userId = RequestContext.currentUserId()
        const strategy = this.connectorStrategyRegistry.get(provider, organizationId)
        const appIntegration = await this.resolveAppIntegration(strategy, provider, input)
        const app = appIntegration ? parseConnectorAppOptions(appIntegration.options) : undefined

        const existing = await this.connectorRepository.findOne({
            where: {
                tenantId,
                workspaceId,
                provider
            }
        })
        const connector = this.connectorRepository.create({
            ...(existing ?? {}),
            tenantId,
            organizationId,
            workspaceId,
            provider,
            status: 'pending',
            appIntegrationId: appIntegration?.id ?? null,
            profile: null,
            scopes: null,
            credentialCiphertext: null,
            expiresAt: null,
            refreshExpiresAt: null,
            connectedAt: null,
            disconnectedAt: null,
            lastError: null,
            updatedById: userId,
            createdById: existing?.createdById ?? userId
        })

        const savedConnector = await this.connectorRepository.save(connector)
        await this.consumeOpenSessions(savedConnector)
        const state = createState()
        const stateExpiresAt = new Date(Date.now() + DEFAULT_STATE_TTL_MS)
        let authorization: Awaited<ReturnType<typeof strategy.buildAuthorizationUrl>>
        try {
            authorization = await strategy.buildAuthorizationUrl({
                app,
                redirectUri: input.redirectUri,
                state,
                scopes: strategy.definition.auth.scopes
            })
        } catch (error) {
            savedConnector.status = 'error'
            savedConnector.lastError = error instanceof Error ? error.message : 'Connector authorization could not be started'
            await this.connectorRepository.save(savedConnector)
            throw error
        }

        await this.sessionRepository.save(
            this.sessionRepository.create({
                tenantId,
                organizationId,
                workspaceId,
                connectorId: savedConnector.id,
                provider,
                appIntegrationId: appIntegration?.id ?? null,
                redirectUri: input.redirectUri,
                authorizationUrl: authorization.authorizationUrl,
                pollIntervalSeconds: authorization.pollIntervalSeconds ?? null,
                metadataCiphertext: this.encryptMetadata(authorization.metadata),
                stateHash: hashState(state),
                scopes: authorization.scopes ?? strategy.definition.auth.scopes ?? null,
                expiresAt: stateExpiresAt,
                createdById: userId,
                updatedById: userId
            })
        )

        return {
            connector: this.toPublicConnector(savedConnector),
            authorizationUrl: authorization.authorizationUrl,
            stateExpiresAt: stateExpiresAt.toISOString(),
            pollIntervalSeconds: authorization.pollIntervalSeconds ?? null
        }
    }

    async authorizationStatus(workspaceId: string, connectorId: string): Promise<ConnectorOAuthStatusResponse> {
        await this.workspaceAccessService.assertCanManage(workspaceId)
        const connector = await this.requireConnector({ workspaceId, connectorId })
        const sessions = await this.sessionRepository.find({
            where: {
                tenantId: connector.tenantId,
                workspaceId,
                connectorId,
                provider: connector.provider
            }
        })
        const openSessions = sessions.filter((item) => !item.consumedAt)
        const session = openSessions
            .filter((item) => item.expiresAt.getTime() >= Date.now())
            .sort((left, right) => right.expiresAt.getTime() - left.expiresAt.getTime())[0]

        if (
            !session ||
            connector.status !== 'pending'
        ) {
            const expiredSession = openSessions.sort(
                (left, right) => right.expiresAt.getTime() - left.expiresAt.getTime()
            )[0]
            if (!session && connector.status === 'pending' && expiredSession) {
                const expiredConnector = await this.expireOAuthSession(expiredSession, connector)
                return {
                    connector: this.toPublicConnector(expiredConnector),
                    authorizationUrl: null,
                    stateExpiresAt: expiredSession.expiresAt.toISOString(),
                    pollIntervalSeconds: null,
                    message: OAUTH_SESSION_EXPIRED_ERROR
                }
            }
            return {
                connector: this.toPublicConnector(connector),
                authorizationUrl: session?.authorizationUrl ?? null,
                stateExpiresAt: session?.expiresAt?.toISOString() ?? null,
                pollIntervalSeconds: session?.pollIntervalSeconds ?? null
            }
        }

        const strategy = this.connectorStrategyRegistry.get(connector.provider, connector.organizationId)
        if (!strategy.pollAuthorization) {
            return {
                connector: this.toPublicConnector(connector),
                authorizationUrl: session.authorizationUrl ?? null,
                stateExpiresAt: session.expiresAt.toISOString(),
                pollIntervalSeconds: session.pollIntervalSeconds ?? null
            }
        }

        const result = await strategy.pollAuthorization({
            metadata: this.decryptMetadata(session.metadataCiphertext),
            redirectUri: session.redirectUri,
            scopes: session.scopes ?? undefined
        })

        return this.applyAuthorizationPollResult(session, connector, result)
    }

    private async consumeOpenSessions(connector: XpertWorkspaceConnector) {
        const sessions = await this.sessionRepository.find({
            where: {
                tenantId: connector.tenantId,
                workspaceId: connector.workspaceId,
                connectorId: connector.id,
                provider: connector.provider
            }
        })
        const now = new Date()
        await Promise.all(
            sessions
                .filter((session) => !session.consumedAt)
                .map((session) =>
                    this.sessionRepository.save({
                        ...session,
                        consumedAt: now,
                        metadataCiphertext: null
                    })
                )
        )
    }

    async completeOAuthCallback(input: ConnectorOAuthCompleteRequest): Promise<ConnectorInstance> {
        if (hasCredentialPayload(input)) {
            throw new BadRequestException('Connector OAuth callback does not accept credential payloads')
        }
        if (!input.code) {
            throw new BadRequestException('Connector OAuth callback requires an authorization code')
        }

        const session = await this.sessionRepository.findOne({
            where: {
                stateHash: hashState(input.state)
            }
        })

        if (!session) {
            throw new BadRequestException('Invalid connector OAuth state')
        }

        const connector = await this.connectorRepository.findOne({
            where: {
                id: session.connectorId,
                tenantId: session.tenantId,
                workspaceId: session.workspaceId,
                provider: session.provider
            }
        })

        if (!connector) {
            throw new NotFoundException(`Connector '${session.connectorId}' was not found`)
        }

        if (session.consumedAt) {
            throw new BadRequestException(OAUTH_SESSION_EXPIRED_ERROR)
        }
        if (session.expiresAt.getTime() < Date.now()) {
            await this.expireOAuthSession(session, connector)
            throw new BadRequestException(OAUTH_SESSION_EXPIRED_ERROR)
        }

        const credential = await this.exchangeOAuthCode(session, input.code)

        return this.activateConnector(session, connector, credential)
    }

    private async expireOAuthSession(
        session: XpertWorkspaceConnectorOAuthSession,
        connector: XpertWorkspaceConnector
    ) {
        const now = new Date()
        session.consumedAt = now
        session.metadataCiphertext = null
        await this.sessionRepository.save(session)

        if (connector.status === 'pending') {
            connector.status = 'expired'
            connector.lastError = OAUTH_SESSION_EXPIRED_ERROR
            await this.connectorRepository.save(connector)
        }

        return connector
    }

    private async applyAuthorizationPollResult(
        session: XpertWorkspaceConnectorOAuthSession,
        connector: XpertWorkspaceConnector,
        result: ConnectorAuthorizationPollResult
    ): Promise<ConnectorOAuthStatusResponse> {
        if (result.status === 'pending') {
            session.authorizationUrl = result.authorizationUrl ?? session.authorizationUrl ?? null
            session.pollIntervalSeconds = result.pollIntervalSeconds ?? session.pollIntervalSeconds ?? null
            session.metadataCiphertext = this.encryptMetadata(result.metadata, session.metadataCiphertext)
            await this.sessionRepository.save(session)

            return {
                connector: this.toPublicConnector(connector),
                authorizationUrl: session.authorizationUrl ?? null,
                stateExpiresAt: session.expiresAt.toISOString(),
                pollIntervalSeconds: session.pollIntervalSeconds ?? null,
                message: result.message ?? null
            }
        }

        if (result.status === 'complete') {
            if (result.metadata) {
                session.metadataCiphertext = this.encryptMetadata(result.metadata, session.metadataCiphertext)
            }
            const activated = await this.activateConnector(session, connector, result.credential)
            return {
                connector: activated,
                authorizationUrl: null,
                stateExpiresAt: session.expiresAt.toISOString(),
                pollIntervalSeconds: null
            }
        }

        connector.status = 'error'
        connector.lastError = result.error
        session.consumedAt = new Date()
        session.metadataCiphertext = null
        await this.sessionRepository.save(session)
        return {
            connector: this.toPublicConnector(await this.connectorRepository.save(connector)),
            authorizationUrl: session.authorizationUrl ?? null,
            stateExpiresAt: session.expiresAt.toISOString(),
            pollIntervalSeconds: session.pollIntervalSeconds ?? null,
            message: result.error
        }
    }

    private async activateConnector(
        session: XpertWorkspaceConnectorOAuthSession,
        connector: XpertWorkspaceConnector,
        credential: ConnectorOAuthCredential
    ): Promise<ConnectorInstance> {
        const now = new Date()
        connector.status = 'active'
        connector.profile = credential.profile ?? null
        connector.scopes = credential.scopes ?? session.scopes ?? null
        connector.credentialCiphertext = encryptSecret(JSON.stringify(credential), this.encryptionKey)
        connector.expiresAt = parseOptionalDate(credential.expiresAt)
        connector.refreshExpiresAt = parseOptionalDate(credential.refreshExpiresAt)
        connector.connectedAt = now
        connector.disconnectedAt = null
        connector.lastError = null

        session.consumedAt = now
        session.metadataCiphertext = null
        await this.sessionRepository.save(session)
        return this.toPublicConnector(await this.connectorRepository.save(connector))
    }

    private async exchangeOAuthCode(session: XpertWorkspaceConnectorOAuthSession, code: string) {
        const strategy = this.connectorStrategyRegistry.get(session.provider, session.organizationId)
        const appIntegration = session.appIntegrationId
            ? await this.integrationService.findOneByIdWithinTenant(session.appIntegrationId, session.tenantId)
            : null

        return strategy.exchangeOAuthCode({
            app: appIntegration ? parseConnectorAppOptions(appIntegration.options) : undefined,
            code,
            redirectUri: session.redirectUri,
            scopes: session.scopes ?? undefined
        })
    }

    async disconnect(workspaceId: string, connectorId: string) {
        await this.workspaceAccessService.assertCanManage(workspaceId)
        const connector = await this.requireConnector({ workspaceId, connectorId })
        await this.consumeOpenSessions(connector)
        connector.status = 'disconnected'
        connector.credentialCiphertext = null
        connector.profile = null
        connector.scopes = null
        connector.expiresAt = null
        connector.refreshExpiresAt = null
        connector.disconnectedAt = new Date()
        connector.lastError = null
        await this.connectorRepository.save(connector)
        return null
    }

    async getRuntimeConnector(input: ConnectorRuntimeGetInput): Promise<ConnectorRuntimeCredential> {
        await this.workspaceAccessService.assertCanRun(input.workspaceId)
        const connector = await this.requireConnector({
            workspaceId: input.workspaceId,
            connectorId: input.connectorId,
            provider: input.provider
        })

        if (connector.status !== 'active' || !connector.credentialCiphertext) {
            throw new BadRequestException(`Connector '${input.provider}' is not active`)
        }

        let credential = this.decryptCredential(connector)
        if (isExpired(connector.expiresAt)) {
            if (!credential.refreshToken) {
                await this.expireRuntimeCredential(connector, 'Connector credential expired and cannot be refreshed')
            }
            if (isExpired(connector.refreshExpiresAt)) {
                await this.expireRuntimeCredential(connector, 'Connector refresh token has expired')
            }
            credential = await this.refreshCredential(connector, credential)
        }

        return {
            connectorId: connector.id,
            workspaceId: connector.workspaceId,
            provider: connector.provider,
            appId: credential.appId,
            brand: credential.brand,
            accessToken: credential.accessToken,
            expiresAt: connector.expiresAt?.toISOString() ?? credential.expiresAt ?? null,
            scopes: connector.scopes ?? credential.scopes,
            profile: connector.profile ?? credential.profile ?? null
        }
    }

    private async refreshCredential(connector: XpertWorkspaceConnector, credential: StoredConnectorCredential) {
        const strategy = this.connectorStrategyRegistry.get(connector.provider, connector.organizationId)
        if (!strategy.refreshCredential || !credential.refreshToken) {
            await this.expireRuntimeCredential(connector, 'Connector credential expired and cannot be refreshed')
        }

        const appIntegration = connector.appIntegrationId
            ? await this.integrationService.findOneByIdWithinTenant(connector.appIntegrationId, connector.tenantId)
            : null
        const app = appIntegration ? parseConnectorAppOptions(appIntegration.options) : credential.app
        let refreshed: ConnectorOAuthCredential
        try {
            refreshed = await strategy.refreshCredential({
                app,
                refreshToken: credential.refreshToken
            })
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            await this.expireRuntimeCredential(connector, `Connector credential refresh failed: ${message}`)
        }
        const storedCredential: StoredConnectorCredential = {
            ...refreshed,
            app: refreshed.app ? parseConnectorAppOptions(refreshed.app) : app
        }
        connector.credentialCiphertext = encryptSecret(JSON.stringify(storedCredential), this.encryptionKey)
        connector.expiresAt = parseOptionalDate(storedCredential.expiresAt)
        connector.refreshExpiresAt = parseOptionalDate(storedCredential.refreshExpiresAt)
        connector.scopes = storedCredential.scopes ?? connector.scopes
        connector.profile = storedCredential.profile ?? connector.profile
        connector.status = 'active'
        connector.lastError = null
        await this.connectorRepository.save(connector)
        return storedCredential
    }

    private async expireRuntimeCredential(connector: XpertWorkspaceConnector, message: string): Promise<never> {
        connector.status = 'expired'
        connector.lastError = message
        await this.connectorRepository.save(connector)
        throw new BadRequestException(message)
    }

    private async requireConnector(input: { workspaceId: string; connectorId?: string; provider?: string }) {
        const tenantId = RequestContext.currentTenantId()
        const connector = await this.connectorRepository.findOne({
            where: {
                tenantId,
                workspaceId: input.workspaceId,
                ...(input.connectorId ? { id: input.connectorId } : {}),
                ...(input.provider ? { provider: input.provider } : {})
            }
        })

        if (!connector) {
            throw new NotFoundException('Workspace connector was not found')
        }

        return connector
    }

    private decryptCredential(connector: XpertWorkspaceConnector): StoredConnectorCredential {
        const decrypted = decryptSecret(connector.credentialCiphertext, this.encryptionKey)
        const parsed = JSON.parse(decrypted)
        return parseStoredCredential(parsed)
    }

    private encryptMetadata(metadata?: Record<string, unknown>, fallback?: string | null) {
        if (!metadata) {
            return fallback ?? null
        }
        return encryptSecret(JSON.stringify(metadata), this.encryptionKey)
    }

    private decryptMetadata(metadataCiphertext?: string | null) {
        if (!metadataCiphertext) {
            return null
        }
        const parsed = JSON.parse(decryptSecret(metadataCiphertext, this.encryptionKey))
        return isRecord(parsed) ? parsed : null
    }

    private async resolveAppIntegration(
        strategy: ConnectorStrategyWithAppIntegrationSelector,
        provider: string,
        input: ConnectorOAuthStartRequest
    ) {
        const definition = strategy.definition
        const tenantId = RequestContext.currentTenantId()
        const appProvider = resolveAppIntegrationProvider(definition, provider)

        if (input.appIntegrationId) {
            if (!acceptsAppIntegrationReference(definition)) {
                throw new BadRequestException('Connector definition does not accept app integrations')
            }
            const integration = await this.integrationService.findOneByIdWithinTenant(input.appIntegrationId, tenantId)
            if (integration.provider !== appProvider) {
                throw new BadRequestException('App integration provider does not match connector definition')
            }
            if (!(await isSelectableAppIntegration(strategy, integration))) {
                throw new BadRequestException('App integration is not accepted by connector definition')
            }
            return integration
        }

        if (!input.app) {
            if (requiresAppIntegration(definition)) {
                throw new BadRequestException('App integration or app credentials are required')
            }
            return null
        }

        if (!acceptsAppCredentialPayload(definition)) {
            throw new BadRequestException('Connector definition does not accept app credentials')
        }

        const defaultValues = definition.appCredentials?.defaultValues ?? {}
        const options = { ...input.app, ...defaultValues }
        if (!(await isSelectableAppIntegration(strategy, { provider: appProvider, options }))) {
            throw new BadRequestException('App integration is not accepted by connector definition')
        }
        return this.integrationService.create({
            name: resolveI18nText(definition.appCredentials?.integrationName) ?? `${provider} App`,
            provider: appProvider,
            options
        })
    }

    private toPublicConnector(connector: XpertWorkspaceConnector): ConnectorInstance {
        return {
            id: connector.id,
            workspaceId: connector.workspaceId,
            provider: connector.provider,
            status: connector.status,
            appIntegrationId: connector.appIntegrationId ?? null,
            profile: connector.profile ?? null,
            scopes: connector.scopes ?? undefined,
            expiresAt: connector.expiresAt?.toISOString() ?? null,
            refreshExpiresAt: connector.refreshExpiresAt?.toISOString() ?? null,
            connectedAt: connector.connectedAt?.toISOString() ?? null,
            disconnectedAt: connector.disconnectedAt?.toISOString() ?? null,
            lastError: connector.lastError ?? null,
            createdById: connector.createdById ?? null,
            updatedById: connector.updatedById ?? null,
            createdAt: connector.createdAt?.toISOString(),
            updatedAt: connector.updatedAt?.toISOString()
        }
    }
}

function createState() {
    return randomBytes(32).toString('base64url')
}

function hashState(state: string) {
    return createHash('sha256').update(state).digest('hex')
}

function parseOptionalDate(value?: string | null) {
    return value ? new Date(value) : null
}

function resolveI18nText(value?: RuntimeI18nText) {
    if (!value) {
        return null
    }

    if (typeof value === 'string') {
        return value
    }

    return (
        value.en_US ??
        value.zh_Hans ??
        Object.values(value).find((item): item is string => typeof item === 'string') ??
        null
    )
}

function connectorProfileDescription(profile?: ConnectorProfile | null): RuntimeI18nText | undefined {
    const identity = [profile?.name, profile?.email, profile?.userId, profile?.openId].find(
        (item): item is string => typeof item === 'string' && !!item.trim()
    )

    if (!identity) {
        return undefined
    }

    return {
        en_US: `Authorized account: ${identity}`,
        zh_Hans: `授权账号：${identity}`
    }
}

function isExpired(value?: Date | null) {
    return !!value && value.getTime() <= Date.now() + 60_000
}

function requiresAppIntegration(definition: ConnectorDefinition) {
    return (
        !definition.appIntegrationOptional && (!!definition.appIntegrationProvider || !!definition.appCredentials?.fields?.length)
    )
}

function acceptsAppCredentialPayload(definition: ConnectorDefinition) {
    return !!definition.appCredentials
}

function acceptsAppIntegrationReference(definition: ConnectorDefinition) {
    return !!definition.appIntegrationProvider || !!definition.appCredentials
}

function resolveAppIntegrationProvider(definition: ConnectorDefinition, provider: string) {
    return definition.appIntegrationProvider ?? `${provider}_app`
}

async function isSelectableAppIntegration(
    strategy: ConnectorStrategyWithAppIntegrationSelector,
    integration: ConnectorAppIntegration
) {
    return (await strategy.isSelectableAppIntegration?.(toConnectorAppIntegration(integration))) !== false
}

function toConnectorAppIntegration(integration: ConnectorAppIntegration): ConnectorAppIntegration {
    return {
        id: integration.id,
        provider: integration.provider,
        name: integration.name,
        description: integration.description,
        options: integration.options
    }
}

function hasCredentialPayload(input: ConnectorOAuthCompleteRequest) {
    return Reflect.get(input, 'credential') != null
}

function parseConnectorAppOptions(value: unknown): ConnectorAppOptions {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new BadRequestException('Connector app options are invalid')
    }

    return { ...value }
}

function parseStoredCredential(value: unknown): StoredConnectorCredential {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new BadRequestException('Stored connector credential is invalid')
    }

    const appId = Reflect.get(value, 'appId')
    const accessToken = Reflect.get(value, 'accessToken')
    if (typeof appId !== 'string' || !appId || typeof accessToken !== 'string' || !accessToken) {
        throw new BadRequestException('Stored connector credential is missing required fields')
    }

    const brand = Reflect.get(value, 'brand')
    const refreshToken = Reflect.get(value, 'refreshToken')
    const expiresAt = Reflect.get(value, 'expiresAt')
    const refreshExpiresAt = Reflect.get(value, 'refreshExpiresAt')
    const scopes = Reflect.get(value, 'scopes')
    const profile = Reflect.get(value, 'profile')
    const appValue = Reflect.get(value, 'app')

    return {
        appId,
        accessToken,
        brand: typeof brand === 'string' ? brand : undefined,
        app: appValue == null ? undefined : parseConnectorAppOptions(appValue),
        refreshToken: typeof refreshToken === 'string' ? refreshToken : undefined,
        expiresAt: typeof expiresAt === 'string' ? expiresAt : undefined,
        refreshExpiresAt: typeof refreshExpiresAt === 'string' ? refreshExpiresAt : undefined,
        scopes: Array.isArray(scopes) && scopes.every((item) => typeof item === 'string') ? scopes : undefined,
        profile: isConnectorProfile(profile) ? profile : undefined
    }
}

function isConnectorProfile(value: unknown): value is ConnectorProfile {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}
