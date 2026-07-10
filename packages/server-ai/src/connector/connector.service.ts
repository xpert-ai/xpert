import { randomBytes, createHash } from 'crypto'
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { decryptSecret, encryptSecret, RequestContext } from '@xpert-ai/server-core'
import { environment } from '@xpert-ai/server-config'
import { ConnectorStrategyRegistry } from '@xpert-ai/plugin-sdk'
import type {
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
import { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import { ConnectorOAuthSession } from './connector-oauth-session.entity'
import { Connector } from './connector.entity'

type RepositoryWhere<T> = {
    where: Partial<T>
}

type ConnectorRepository<T extends { id?: string }> = {
    create(input: Partial<T>): T
    save(input: T): Promise<T>
    findOne(options: RepositoryWhere<T>): Promise<T | null>
    find(options?: RepositoryWhere<T>): Promise<T[]>
}

type ConnectorEntityRepository = ConnectorRepository<Connector>
type OAuthSessionRepository = ConnectorRepository<ConnectorOAuthSession>

type ConnectorAccessService = Pick<
    XpertWorkspaceAccessService,
    'assertCanRead' | 'assertCanManage' | 'assertCanRun'
>

type ConnectorStrategyRegistryService = Pick<ConnectorStrategyRegistry, 'get' | 'list'>

type StartOAuthInput = ConnectorOAuthStartRequest & {
    redirectUri: string
}

type ConnectorAppOptions = Record<string, unknown>

type StoredConnectorCredential = ConnectorOAuthCredential & {
    app?: ConnectorAppOptions
}

type ConnectorSessionMetadata = {
    strategy?: Record<string, unknown> | null
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
export class ConnectorService {
    private readonly encryptionKey = environment.secretsEncryptionKey

    constructor(
        @InjectRepository(Connector)
        private readonly connectorRepository: ConnectorEntityRepository,
        @InjectRepository(ConnectorOAuthSession)
        private readonly sessionRepository: OAuthSessionRepository,
        @Inject(XpertWorkspaceAccessService)
        private readonly workspaceAccessService: ConnectorAccessService,
        @Inject(ConnectorStrategyRegistry)
        private readonly connectorStrategyRegistry: ConnectorStrategyRegistryService
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
        const app = this.resolveConnectorApp(strategy.definition, input)

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
            appIntegrationId: null,
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
                appIntegrationId: null,
                redirectUri: input.redirectUri,
                authorizationUrl: authorization.authorizationUrl,
                pollIntervalSeconds: authorization.pollIntervalSeconds ?? null,
                metadataCiphertext: this.encryptSessionMetadata({ strategy: authorization.metadata ?? null, app }),
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
            metadata: this.decryptStrategyMetadata(session.metadataCiphertext),
            redirectUri: session.redirectUri,
            scopes: session.scopes ?? undefined
        })

        return this.applyAuthorizationPollResult(session, connector, result)
    }

    private async consumeOpenSessions(connector: Connector) {
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
        session: ConnectorOAuthSession,
        connector: Connector
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
        session: ConnectorOAuthSession,
        connector: Connector,
        result: ConnectorAuthorizationPollResult
    ): Promise<ConnectorOAuthStatusResponse> {
        if (result.status === 'pending') {
            session.authorizationUrl = result.authorizationUrl ?? session.authorizationUrl ?? null
            session.pollIntervalSeconds = result.pollIntervalSeconds ?? session.pollIntervalSeconds ?? null
            session.metadataCiphertext = this.updateStrategyMetadata(session.metadataCiphertext, result.metadata)
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
                session.metadataCiphertext = this.updateStrategyMetadata(session.metadataCiphertext, result.metadata)
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
        session: ConnectorOAuthSession,
        connector: Connector,
        credential: ConnectorOAuthCredential
    ): Promise<ConnectorInstance> {
        const now = new Date()
        const app = this.decryptSessionApp(session.metadataCiphertext)
        const storedCredential: StoredConnectorCredential = {
            ...credential,
            app: credential.app ? parseConnectorAppOptions(credential.app) : app ?? undefined
        }
        connector.status = 'active'
        connector.profile = storedCredential.profile ?? null
        connector.scopes = storedCredential.scopes ?? session.scopes ?? null
        connector.credentialCiphertext = encryptSecret(JSON.stringify(storedCredential), this.encryptionKey)
        connector.expiresAt = parseOptionalDate(storedCredential.expiresAt)
        connector.refreshExpiresAt = parseOptionalDate(storedCredential.refreshExpiresAt)
        connector.connectedAt = now
        connector.disconnectedAt = null
        connector.lastError = null

        session.consumedAt = now
        session.metadataCiphertext = null
        await this.sessionRepository.save(session)
        return this.toPublicConnector(await this.connectorRepository.save(connector))
    }

    private async exchangeOAuthCode(session: ConnectorOAuthSession, code: string) {
        const strategy = this.connectorStrategyRegistry.get(session.provider, session.organizationId)
        const app = this.decryptSessionApp(session.metadataCiphertext)

        return strategy.exchangeOAuthCode({
            app: app ?? undefined,
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

    private async refreshCredential(connector: Connector, credential: StoredConnectorCredential) {
        const strategy = this.connectorStrategyRegistry.get(connector.provider, connector.organizationId)
        if (!strategy.refreshCredential || !credential.refreshToken) {
            await this.expireRuntimeCredential(connector, 'Connector credential expired and cannot be refreshed')
        }

        const app = credential.app
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

    private async expireRuntimeCredential(connector: Connector, message: string): Promise<never> {
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
            throw new NotFoundException('Connector was not found')
        }

        return connector
    }

    private decryptCredential(connector: Connector): StoredConnectorCredential {
        const decrypted = decryptSecret(connector.credentialCiphertext, this.encryptionKey)
        const parsed = JSON.parse(decrypted)
        return parseStoredCredential(parsed)
    }

    private encryptSessionMetadata(metadata: ConnectorSessionMetadata) {
        if (!metadata.strategy && !metadata.app) {
            return null
        }
        return encryptSecret(JSON.stringify(metadata), this.encryptionKey)
    }

    private decryptSessionMetadata(metadataCiphertext?: string | null): ConnectorSessionMetadata {
        if (!metadataCiphertext) {
            return {}
        }
        const parsed = JSON.parse(decryptSecret(metadataCiphertext, this.encryptionKey))
        if (!isRecord(parsed)) {
            return {}
        }
        if (isRecord(parsed.strategy) || parsed.strategy === null || isRecord(parsed.app)) {
            return {
                strategy: isRecord(parsed.strategy) ? parsed.strategy : null,
                app: isRecord(parsed.app) ? parseConnectorAppOptions(parsed.app) : undefined
            }
        }
        return { strategy: parsed }
    }

    private decryptStrategyMetadata(metadataCiphertext?: string | null) {
        return this.decryptSessionMetadata(metadataCiphertext).strategy ?? null
    }

    private decryptSessionApp(metadataCiphertext?: string | null) {
        return this.decryptSessionMetadata(metadataCiphertext).app ?? null
    }

    private updateStrategyMetadata(metadataCiphertext: string | null | undefined, strategy?: Record<string, unknown>) {
        const metadata = this.decryptSessionMetadata(metadataCiphertext)
        return this.encryptSessionMetadata({
            ...metadata,
            strategy: strategy ?? metadata.strategy ?? null
        })
    }

    private resolveConnectorApp(definition: ConnectorDefinition, input: ConnectorOAuthStartRequest) {
        if (hasLegacyAppIntegrationReference(input)) {
            throw new BadRequestException('Connector app integrations are not supported')
        }
        if (!input.app) {
            if (requiresAppCredentials(definition)) {
                throw new BadRequestException('Connector app credentials are required')
            }
            return buildDefaultConnectorApp(definition)
        }

        if (!acceptsAppCredentialPayload(definition)) {
            throw new BadRequestException('Connector definition does not accept app credentials')
        }

        const defaultValues = definition.appCredentials?.defaultValues ?? {}
        return parseConnectorAppOptions({ ...input.app, ...defaultValues })
    }

    private toPublicConnector(connector: Connector): ConnectorInstance {
        return {
            id: connector.id,
            workspaceId: connector.workspaceId,
            provider: connector.provider,
            status: connector.status,
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

function requiresAppCredentials(definition: ConnectorDefinition) {
    return !!definition.appCredentials?.fields?.length
}

function acceptsAppCredentialPayload(definition: ConnectorDefinition) {
    return !!definition.appCredentials
}

function buildDefaultConnectorApp(definition: ConnectorDefinition) {
    const defaultValues = definition.appCredentials?.defaultValues
    return defaultValues ? parseConnectorAppOptions(defaultValues) : undefined
}

function hasLegacyAppIntegrationReference(input: ConnectorOAuthStartRequest) {
    return Object.prototype.hasOwnProperty.call(input, 'appIntegrationId')
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
