import { createHash, randomBytes, randomUUID } from 'crypto'
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, type FindOptionsWhere } from 'typeorm'
import { decryptSecret, encryptSecret, RequestContext } from '@xpert-ai/server-core'
import { environment } from '@xpert-ai/server-config'
import { t } from 'i18next'
import { assertConnectorDefinition, ConnectorStrategyRegistry, getConnectorAuthMethods } from '@xpert-ai/plugin-sdk'
import type {
    ConnectorAuthMethodDefinition,
    ConnectorConnectRequest,
    ConnectorConnectResponse,
    ConnectorConnectionPollResult,
    ConnectorCredential,
    ConnectorCredentialFormDefinition,
    ConnectorInstance,
    ConnectorOAuthCompleteRequest,
    ConnectorOAuthCredential,
    ConnectorOAuthStatusResponse,
    ConnectorOAuthStartRequest,
    ConnectorOAuthStartResponse,
    ConnectorProfile,
    ConnectorRuntimeCredential,
    ConnectorRuntimeCredentialV2,
    ConnectorRuntimeGetInput,
    ConnectorSelectOption,
    ConnectorStrategyDefinition,
    ConnectorStrategyRuntime,
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
    update(criteria: FindOptionsWhere<T>, input: Partial<T>): Promise<{ affected?: number | null }>
    findOne(options: RepositoryWhere<T>): Promise<T | null>
    find(options?: RepositoryWhere<T>): Promise<T[]>
}

type ConnectorEntityRepository = ConnectorRepository<Connector>
type OAuthSessionRepository = ConnectorRepository<ConnectorOAuthSession>

type ConnectorAccessService = Pick<XpertWorkspaceAccessService, 'assertCanRead' | 'assertCanManage' | 'assertCanRun'>

type ConnectorStrategyRegistryService = Pick<ConnectorStrategyRegistry, 'getRuntime' | 'listRuntime'>

type ConnectorConnectServiceInput = ConnectorConnectRequest & {
    redirectUri: string
}

type StartOAuthInput = ConnectorOAuthStartRequest & {
    redirectUri: string
}

type ConnectorValues = Record<string, unknown>

type StoredConnectorCredential = {
    version: 1
    authMethodId: string
    credential: ConnectorCredential
}

type ConnectorSessionMetadata = {
    version?: 1
    authMethodId?: string
    connectionAttemptId?: string
    strategy?: Record<string, unknown> | null
    values?: ConnectorValues
    /** Legacy sessions used app instead of values. */
    app?: ConnectorValues
}

type ConnectorProviderSelectOption = {
    value: string
    label: RuntimeI18nText
    description?: RuntimeI18nText
    icon?: ConnectorStrategyDefinition['icon']
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

    async definitions(workspaceId: string): Promise<ConnectorStrategyDefinition[]> {
        await this.workspaceAccessService.assertCanRead(workspaceId)
        const organizationId = RequestContext.getOrganizationId()
        return this.connectorStrategyRegistry
            .listRuntime(organizationId)
            .map((strategy) => toPublicDefinition(strategy.definition))
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
            this.connectorStrategyRegistry
                .listRuntime(organizationId)
                .map((strategy) => [strategy.definition.provider, strategy.definition])
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

    async connect(
        workspaceId: string,
        provider: string,
        input: ConnectorConnectServiceInput
    ): Promise<ConnectorConnectResponse> {
        await this.workspaceAccessService.assertCanManage(workspaceId)
        if (hasLegacyAppIntegrationReference(input)) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorAppIntegrationUnsupported', {
                    defaultValue: 'Connector app integrations are not supported'
                })
            )
        }

        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const userId = RequestContext.currentUserId()
        const strategy = this.connectorStrategyRegistry.getRuntime(provider, organizationId)
        assertConnectorDefinition(strategy.definition)
        const authMethod = resolveAuthMethod(strategy.definition, input.authMethodId)
        const values = resolveConnectorValues(authMethod, input)
        const connectionAttemptId = randomUUID()

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
            authMethodId: authMethod.id,
            connectionAttemptId,
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
        await this.consumeSupersededSessions(savedConnector)
        const state = createState()
        const stateExpiresAt = new Date(Date.now() + DEFAULT_STATE_TTL_MS)

        let result: Awaited<ReturnType<NonNullable<ConnectorStrategyRuntime['connect']>>>
        try {
            result = await this.startStrategyConnection(strategy, authMethod, {
                authMethodId: authMethod.id,
                values,
                redirectUri: input.redirectUri,
                state,
                scopes: legacyScopes(strategy.definition)
            })

            if (result.status === 'active') {
                const activated = await this.activateConnector(
                    savedConnector,
                    authMethod.id,
                    connectionAttemptId,
                    result.credential,
                    legacyScopes(strategy.definition)
                )
                return {
                    status: 'active',
                    connector: activated
                }
            }

            if (authMethod.type !== 'oauth2') {
                throw new BadRequestException(
                    t('server-ai:Error.ConnectorAuthMethodCannotPending', {
                        method: authMethod.id,
                        defaultValue: `Connector authentication method '${authMethod.id}' cannot return pending authorization`
                    })
                )
            }
        } catch (error) {
            await this.markConnectionError(
                savedConnector,
                connectionAttemptId,
                error instanceof Error ? error.message : 'Connector authorization could not be started'
            )
            throw error
        }

        const savedSession = await this.sessionRepository.save(
            this.sessionRepository.create({
                tenantId,
                organizationId,
                workspaceId,
                connectorId: savedConnector.id,
                provider,
                appIntegrationId: null,
                redirectUri: input.redirectUri,
                authorizationUrl: result.authorizationUrl,
                pollIntervalSeconds: result.pollIntervalSeconds ?? null,
                metadataCiphertext: this.encryptSessionMetadata({
                    authMethodId: authMethod.id,
                    connectionAttemptId,
                    strategy: result.metadata ?? null,
                    values
                }),
                stateHash: hashState(state),
                scopes: result.scopes ?? legacyScopes(strategy.definition) ?? null,
                expiresAt: stateExpiresAt,
                createdById: userId,
                updatedById: userId
            })
        )
        const currentConnector = await this.findCurrentConnector(savedConnector)
        if (
            !currentConnector ||
            currentConnector.status !== 'pending' ||
            currentConnector.connectionAttemptId !== connectionAttemptId
        ) {
            await this.consumeOAuthSession(savedSession)
            throw new BadRequestException(OAUTH_SESSION_EXPIRED_ERROR)
        }

        return {
            status: 'pending',
            connector: this.toPublicConnector(currentConnector),
            authorizationUrl: result.authorizationUrl,
            stateExpiresAt: stateExpiresAt.toISOString(),
            pollIntervalSeconds: result.pollIntervalSeconds ?? null
        }
    }

    /** @deprecated Public callers should use connect. */
    async startOAuth(
        workspaceId: string,
        provider: string,
        input: StartOAuthInput
    ): Promise<ConnectorOAuthStartResponse> {
        if (hasLegacyAppIntegrationReference(input)) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorAppIntegrationUnsupported', {
                    defaultValue: 'Connector app integrations are not supported'
                })
            )
        }
        const result = await this.connect(workspaceId, provider, {
            app: input.app,
            redirectUri: input.redirectUri
        })
        if (result.status !== 'pending' || !result.authorizationUrl || !result.stateExpiresAt) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorOAuthStartInvalid', {
                    provider,
                    defaultValue: `Connector '${provider}' did not start an OAuth authorization`
                })
            )
        }
        return {
            connector: result.connector,
            authorizationUrl: result.authorizationUrl,
            stateExpiresAt: result.stateExpiresAt,
            pollIntervalSeconds: result.pollIntervalSeconds
        }
    }

    private async startStrategyConnection(
        strategy: ConnectorStrategyRuntime,
        authMethod: ConnectorAuthMethodDefinition,
        input: Parameters<NonNullable<ConnectorStrategyRuntime['connect']>>[0]
    ) {
        if (strategy.connect) {
            return strategy.connect(input)
        }
        if (authMethod.type !== 'oauth2' || !strategy.buildAuthorizationUrl) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorAuthMethodNotImplemented', {
                    provider: strategy.definition.provider,
                    method: authMethod.id,
                    defaultValue: `Connector '${strategy.definition.provider}' does not implement authentication method '${authMethod.id}'`
                })
            )
        }

        const authorization = await strategy.buildAuthorizationUrl({
            app: input.values,
            redirectUri: input.redirectUri,
            state: input.state,
            scopes: input.scopes
        })
        return {
            status: 'pending' as const,
            authorizationUrl: authorization.authorizationUrl,
            scopes: authorization.scopes,
            metadata: authorization.metadata,
            pollIntervalSeconds: authorization.pollIntervalSeconds
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
        const currentSessions = openSessions.filter((item) => this.isCurrentSession(item, connector))
        const session = currentSessions
            .filter((item) => item.expiresAt.getTime() >= Date.now())
            .sort((left, right) => right.expiresAt.getTime() - left.expiresAt.getTime())[0]

        if (!session || connector.status !== 'pending') {
            const expiredSession = currentSessions.sort(
                (left, right) => right.expiresAt.getTime() - left.expiresAt.getTime()
            )[0]
            if (!session && connector.status === 'pending' && expiredSession) {
                const expiredMetadata = this.decryptSessionMetadata(expiredSession.metadataCiphertext)
                const expiredConnector = await this.expireOAuthSession(
                    expiredSession,
                    connector,
                    expiredMetadata.connectionAttemptId
                )
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

        const strategy = this.connectorStrategyRegistry.getRuntime(connector.provider, connector.organizationId)
        const metadata = this.decryptSessionMetadata(session.metadataCiphertext)
        const authMethodId = resolveSessionAuthMethodId(metadata, connector, strategy.definition)
        let result: ConnectorConnectionPollResult | null = null
        if (strategy.pollConnection) {
            result = await strategy.pollConnection({
                authMethodId,
                values: metadata.values,
                metadata: metadata.strategy ?? null,
                redirectUri: session.redirectUri,
                scopes: session.scopes ?? undefined
            })
        } else if (strategy.pollAuthorization) {
            const legacyResult = await strategy.pollAuthorization({
                metadata: metadata.strategy ?? null,
                redirectUri: session.redirectUri,
                scopes: session.scopes ?? undefined
            })
            result = normalizeLegacyPollResult(legacyResult, metadata.values)
        }

        if (!result) {
            return {
                connector: this.toPublicConnector(connector),
                authorizationUrl: session.authorizationUrl ?? null,
                stateExpiresAt: session.expiresAt.toISOString(),
                pollIntervalSeconds: session.pollIntervalSeconds ?? null
            }
        }

        return this.applyAuthorizationPollResult(session, connector, metadata.connectionAttemptId, authMethodId, result)
    }

    private async consumeSupersededSessions(connector: Connector) {
        const sessions = await this.sessionRepository.find({
            where: {
                tenantId: connector.tenantId,
                workspaceId: connector.workspaceId,
                connectorId: connector.id,
                provider: connector.provider
            }
        })
        const currentConnector = await this.connectorRepository.findOne({
            where: {
                id: connector.id,
                tenantId: connector.tenantId,
                workspaceId: connector.workspaceId,
                provider: connector.provider
            }
        })
        const currentAttemptId = currentConnector?.connectionAttemptId ?? null
        await Promise.all(
            sessions
                .filter((session) => {
                    if (session.consumedAt) {
                        return false
                    }
                    const metadata = this.decryptSessionMetadata(session.metadataCiphertext)
                    return !currentAttemptId || metadata.connectionAttemptId !== currentAttemptId
                })
                .map((session) => this.consumeOAuthSession(session))
        )
    }

    private async consumeOAuthSession(session: ConnectorOAuthSession) {
        session.consumedAt = new Date()
        session.metadataCiphertext = null
        await this.sessionRepository.save(session)
    }

    private isCurrentSession(session: ConnectorOAuthSession, connector: Connector) {
        const metadata = this.decryptSessionMetadata(session.metadataCiphertext)
        return metadata.connectionAttemptId
            ? metadata.connectionAttemptId === connector.connectionAttemptId
            : !connector.connectionAttemptId
    }

    async getOAuthCallbackContext(state: string): Promise<{ workspaceId: string } | null> {
        if (!state) {
            return null
        }
        const session = await this.sessionRepository.findOne({
            where: {
                stateHash: hashState(state)
            }
        })
        return session ? { workspaceId: session.workspaceId } : null
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
        const metadata = this.decryptSessionMetadata(session.metadataCiphertext)
        if (!this.isCurrentSession(session, connector)) {
            await this.consumeOAuthSession(session)
            throw new BadRequestException(OAUTH_SESSION_EXPIRED_ERROR)
        }
        if (session.expiresAt.getTime() < Date.now()) {
            await this.expireOAuthSession(session, connector, metadata.connectionAttemptId)
            throw new BadRequestException(OAUTH_SESSION_EXPIRED_ERROR)
        }

        const { authMethodId, credential } = await this.exchangeOAuthCode(session, connector, metadata, input.code)
        const activated = await this.activateConnector(
            connector,
            authMethodId,
            metadata.connectionAttemptId,
            credential,
            session.scopes
        )
        await this.consumeOAuthSession(session)
        return activated
    }

    private async expireOAuthSession(
        session: ConnectorOAuthSession,
        connector: Connector,
        connectionAttemptId?: string
    ) {
        await this.consumeOAuthSession(session)

        if (connector.status === 'pending') {
            const updated = await this.updatePendingConnection(connector, connectionAttemptId, {
                status: 'expired',
                lastError: OAUTH_SESSION_EXPIRED_ERROR
            })
            if (updated) {
                return updated
            }
        }

        return (await this.findCurrentConnector(connector)) ?? connector
    }

    private async applyAuthorizationPollResult(
        session: ConnectorOAuthSession,
        connector: Connector,
        connectionAttemptId: string | undefined,
        authMethodId: string,
        result: ConnectorConnectionPollResult
    ): Promise<ConnectorOAuthStatusResponse> {
        const currentConnector = await this.findCurrentConnector(connector)
        if (
            !currentConnector ||
            currentConnector.status !== 'pending' ||
            (connectionAttemptId
                ? currentConnector.connectionAttemptId !== connectionAttemptId
                : !!currentConnector.connectionAttemptId)
        ) {
            await this.consumeOAuthSession(session)
            throw new BadRequestException(OAUTH_SESSION_EXPIRED_ERROR)
        }

        if (result.status === 'pending') {
            session.authorizationUrl = result.authorizationUrl ?? session.authorizationUrl ?? null
            session.pollIntervalSeconds = result.pollIntervalSeconds ?? session.pollIntervalSeconds ?? null
            session.metadataCiphertext = this.updateStrategyMetadata(session.metadataCiphertext, result.metadata)
            await this.sessionRepository.save(session)

            return {
                connector: this.toPublicConnector(currentConnector),
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
            const activated = await this.activateConnector(
                currentConnector,
                authMethodId,
                connectionAttemptId,
                result.credential,
                session.scopes
            )
            await this.consumeOAuthSession(session)
            return {
                connector: activated,
                authorizationUrl: null,
                stateExpiresAt: session.expiresAt.toISOString(),
                pollIntervalSeconds: null
            }
        }

        const updated = await this.updatePendingConnection(currentConnector, connectionAttemptId, {
            status: 'error',
            lastError: result.error
        })
        await this.consumeOAuthSession(session)
        if (!updated) {
            throw new BadRequestException(OAUTH_SESSION_EXPIRED_ERROR)
        }
        return {
            connector: this.toPublicConnector(updated),
            authorizationUrl: session.authorizationUrl ?? null,
            stateExpiresAt: session.expiresAt.toISOString(),
            pollIntervalSeconds: session.pollIntervalSeconds ?? null,
            message: result.error
        }
    }

    private async activateConnector(
        connector: Connector,
        authMethodId: string,
        connectionAttemptId: string | undefined,
        credential: ConnectorCredential,
        fallbackScopes?: string[] | null
    ): Promise<ConnectorInstance> {
        const parsedCredential = parseConnectorCredential(credential)
        const scopes = parsedCredential.scopes ?? fallbackScopes ?? undefined
        const storedCredential: StoredConnectorCredential = {
            version: 1,
            authMethodId,
            credential: {
                ...parsedCredential,
                ...(scopes !== undefined ? { scopes } : {})
            }
        }
        const updated = await this.updatePendingConnection(connector, connectionAttemptId, {
            authMethodId,
            status: 'active',
            profile: storedCredential.credential.profile ?? null,
            scopes: storedCredential.credential.scopes ?? null,
            credentialCiphertext: encryptSecret(JSON.stringify(storedCredential), this.encryptionKey),
            expiresAt: parseOptionalDate(storedCredential.credential.expiresAt),
            refreshExpiresAt: parseOptionalDate(storedCredential.credential.refreshExpiresAt),
            connectedAt: new Date(),
            disconnectedAt: null,
            lastError: null
        })
        if (!updated) {
            throw new BadRequestException(OAUTH_SESSION_EXPIRED_ERROR)
        }
        return this.toPublicConnector(updated)
    }

    private async markConnectionError(connector: Connector, connectionAttemptId: string, message: string) {
        await this.updatePendingConnection(connector, connectionAttemptId, {
            status: 'error',
            lastError: message
        })
    }

    private async updatePendingConnection(
        connector: Connector,
        connectionAttemptId: string | undefined,
        input: Partial<Connector>
    ) {
        if (!connector.id) {
            return null
        }

        if (!connectionAttemptId) {
            const result = await this.connectorRepository.update(
                {
                    id: connector.id,
                    status: 'pending',
                    connectionAttemptId: IsNull()
                },
                input
            )
            if (result.affected !== 1) {
                return null
            }
            return this.findCurrentConnector(connector)
        }

        const result = await this.connectorRepository.update(
            {
                id: connector.id,
                status: 'pending',
                connectionAttemptId
            },
            input
        )
        if (result.affected !== 1) {
            return null
        }
        return this.findCurrentConnector(connector)
    }

    private findCurrentConnector(connector: Connector) {
        return this.connectorRepository.findOne({
            where: {
                id: connector.id,
                tenantId: connector.tenantId,
                workspaceId: connector.workspaceId,
                provider: connector.provider
            }
        })
    }

    private async exchangeOAuthCode(
        session: ConnectorOAuthSession,
        connector: Connector,
        metadata: ConnectorSessionMetadata,
        code: string
    ) {
        const strategy = this.connectorStrategyRegistry.getRuntime(session.provider, session.organizationId)
        const authMethodId = resolveSessionAuthMethodId(metadata, connector, strategy.definition)

        if (strategy.exchangeAuthorizationCode) {
            const credential = await strategy.exchangeAuthorizationCode({
                authMethodId,
                values: metadata.values,
                metadata: metadata.strategy ?? null,
                code,
                redirectUri: session.redirectUri,
                scopes: session.scopes ?? undefined
            })
            return { authMethodId, credential }
        }
        if (!strategy.exchangeOAuthCode) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorOAuthExchangeNotImplemented', {
                    provider: session.provider,
                    defaultValue: `Connector '${session.provider}' does not implement OAuth code exchange`
                })
            )
        }

        const credential = await strategy.exchangeOAuthCode({
            app: metadata.values,
            code,
            redirectUri: session.redirectUri,
            scopes: session.scopes ?? undefined
        })
        return {
            authMethodId,
            credential: normalizeLegacyCredential(credential, metadata.values)
        }
    }

    async disconnect(workspaceId: string, connectorId: string) {
        await this.workspaceAccessService.assertCanManage(workspaceId)
        const connector = await this.requireConnector({ workspaceId, connectorId })
        connector.status = 'disconnected'
        connector.connectionAttemptId = null
        connector.credentialCiphertext = null
        connector.profile = null
        connector.scopes = null
        connector.expiresAt = null
        connector.refreshExpiresAt = null
        connector.disconnectedAt = new Date()
        connector.lastError = null
        await this.connectorRepository.save(connector)
        await this.consumeSupersededSessions(connector)
        return null
    }

    async getRuntimeConnector(input: ConnectorRuntimeGetInput): Promise<ConnectorRuntimeCredential> {
        const runtime = await this.getRuntimeConnectorCredential(input)
        const appId = stringValue(runtime.credentials.appId)
        const brand = stringValue(runtime.credentials.brand)
        const accessToken = stringValue(runtime.credentials.accessToken)
        if (!appId || !accessToken) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorRuntimeProjectionInvalid', {
                    defaultValue: 'Connector runtime credential projection is invalid'
                })
            )
        }
        return {
            connectorId: runtime.connectorId,
            workspaceId: runtime.workspaceId,
            provider: runtime.provider,
            appId,
            ...(brand ? { brand } : {}),
            accessToken,
            expiresAt: runtime.expiresAt,
            scopes: runtime.scopes,
            profile: runtime.profile
        }
    }

    async getRuntimeConnectorCredential(input: ConnectorRuntimeGetInput): Promise<ConnectorRuntimeCredentialV2> {
        await this.workspaceAccessService.assertCanRun(input.workspaceId)
        const connector = await this.requireConnector({
            workspaceId: input.workspaceId,
            connectorId: input.connectorId,
            provider: input.provider
        })

        if (connector.status !== 'active' || !connector.credentialCiphertext) {
            throw new BadRequestException(`Connector '${input.provider}' is not active`)
        }

        const credentialCiphertext = connector.credentialCiphertext
        const strategy = this.connectorStrategyRegistry.getRuntime(connector.provider, connector.organizationId)
        let stored = this.decryptCredential(connector, strategy.definition)
        if (isExpired(connector.expiresAt)) {
            if (isExpired(connector.refreshExpiresAt)) {
                await this.expireRuntimeCredential(
                    connector,
                    credentialCiphertext,
                    'Connector refresh token has expired'
                )
            }
            stored = await this.refreshCredential(connector, strategy, stored, credentialCiphertext)
        }

        const runtimeCredentials = strategy.resolveRuntimeCredential
            ? await strategy.resolveRuntimeCredential({
                  authMethodId: stored.authMethodId,
                  credential: stored.credential
              })
            : projectLegacyRuntimeCredential(stored.credential)
        if (!isRecord(runtimeCredentials)) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorRuntimeProjectionInvalid', {
                    defaultValue: 'Connector runtime credential projection is invalid'
                })
            )
        }

        return {
            connectorId: connector.id,
            workspaceId: connector.workspaceId,
            provider: connector.provider,
            authMethodId: stored.authMethodId,
            credentials: runtimeCredentials,
            expiresAt: connector.expiresAt?.toISOString() ?? stored.credential.expiresAt ?? null,
            scopes: connector.scopes ?? stored.credential.scopes,
            profile: connector.profile ?? stored.credential.profile ?? null
        }
    }

    private async refreshCredential(
        connector: Connector,
        strategy: ConnectorStrategyRuntime,
        stored: StoredConnectorCredential,
        expectedCiphertext: string
    ) {
        let refreshed: ConnectorCredential
        try {
            if (strategy.refreshConnectionCredential) {
                refreshed = await strategy.refreshConnectionCredential({
                    authMethodId: stored.authMethodId,
                    credential: stored.credential
                })
            } else {
                const refreshToken = stringValue(stored.credential.data.refreshToken)
                if (!strategy.refreshCredential || !refreshToken) {
                    await this.expireRuntimeCredential(
                        connector,
                        expectedCiphertext,
                        'Connector credential expired and cannot be refreshed'
                    )
                }
                const legacy = await strategy.refreshCredential({
                    app: recordValue(stored.credential.data.app),
                    refreshToken
                })
                refreshed = normalizeLegacyCredential(legacy, recordValue(stored.credential.data.app))
            }
        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error
            }
            const message = error instanceof Error ? error.message : 'Unknown error'
            await this.expireRuntimeCredential(
                connector,
                expectedCiphertext,
                `Connector credential refresh failed: ${message}`
            )
        }

        const next: StoredConnectorCredential = {
            version: 1,
            authMethodId: stored.authMethodId,
            credential: parseConnectorCredential(refreshed)
        }
        const update: Partial<Connector> = {
            credentialCiphertext: encryptSecret(JSON.stringify(next), this.encryptionKey),
            expiresAt: parseOptionalDate(next.credential.expiresAt),
            refreshExpiresAt: parseOptionalDate(next.credential.refreshExpiresAt),
            scopes: next.credential.scopes ?? connector.scopes,
            profile: next.credential.profile ?? connector.profile,
            status: 'active',
            lastError: null
        }
        const result = await this.connectorRepository.update(
            {
                id: connector.id,
                status: 'active',
                credentialCiphertext: expectedCiphertext
            },
            update
        )
        if (result.affected !== 1) {
            throw connectorCredentialChangedError()
        }
        Object.assign(connector, update)
        return next
    }

    private async expireRuntimeCredential(
        connector: Connector,
        expectedCiphertext: string,
        message: string
    ): Promise<never> {
        const result = await this.connectorRepository.update(
            {
                id: connector.id,
                status: 'active',
                credentialCiphertext: expectedCiphertext
            },
            {
                status: 'expired',
                lastError: message
            }
        )
        if (result.affected !== 1) {
            throw connectorCredentialChangedError()
        }
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

    private decryptCredential(
        connector: Connector,
        definition: ConnectorStrategyDefinition
    ): StoredConnectorCredential {
        const decrypted = decryptSecret(connector.credentialCiphertext, this.encryptionKey)
        const parsed: unknown = JSON.parse(decrypted)
        return isRecord(parsed) && parsed.version === 1
            ? parseStoredCredential(parsed)
            : parseStoredCredential(parsed, resolveStoredAuthMethodId(connector, definition))
    }

    private encryptSessionMetadata(metadata: ConnectorSessionMetadata) {
        if (
            !metadata.authMethodId &&
            !metadata.connectionAttemptId &&
            !metadata.strategy &&
            !metadata.values &&
            !metadata.app
        ) {
            return null
        }
        return encryptSecret(JSON.stringify({ ...metadata, version: 1 }), this.encryptionKey)
    }

    private decryptSessionMetadata(metadataCiphertext?: string | null): ConnectorSessionMetadata {
        if (!metadataCiphertext) {
            return {}
        }
        const parsed: unknown = JSON.parse(decryptSecret(metadataCiphertext, this.encryptionKey))
        if (!isRecord(parsed)) {
            return {}
        }
        if (parsed.version === 1) {
            const values = recordValue(parsed.values) ?? recordValue(parsed.app)
            return {
                version: 1,
                authMethodId: stringValue(parsed.authMethodId),
                connectionAttemptId: stringValue(parsed.connectionAttemptId),
                strategy: isRecord(parsed.strategy) ? parsed.strategy : parsed.strategy === null ? null : undefined,
                values
            }
        }
        if (isRecord(parsed.strategy) || parsed.strategy === null || isRecord(parsed.values) || isRecord(parsed.app)) {
            const values = recordValue(parsed.values) ?? recordValue(parsed.app)
            return {
                strategy: isRecord(parsed.strategy) ? parsed.strategy : null,
                values
            }
        }
        return { strategy: parsed }
    }

    private updateStrategyMetadata(metadataCiphertext: string | null | undefined, strategy?: Record<string, unknown>) {
        const metadata = this.decryptSessionMetadata(metadataCiphertext)
        return this.encryptSessionMetadata({
            ...metadata,
            strategy: strategy ?? metadata.strategy ?? null
        })
    }

    private toPublicConnector(connector: Connector): ConnectorInstance {
        return {
            id: connector.id,
            workspaceId: connector.workspaceId,
            provider: connector.provider,
            authMethodId: connector.authMethodId ?? null,
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

function hashCredentialCiphertext(ciphertext: string) {
    return createHash('sha256').update(ciphertext).digest('base64url')
}

function connectorCredentialChangedError() {
    return new BadRequestException(
        t('server-ai:Error.ConnectorCredentialChanged', {
            defaultValue: 'Connector credentials changed while the request was running. Retry the operation.'
        })
    )
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

function resolveAuthMethod(definition: ConnectorStrategyDefinition, authMethodId?: string) {
    const methods = getConnectorAuthMethods(definition)
    if (!authMethodId && methods.length > 1) {
        throw new BadRequestException(
            t('server-ai:Error.ConnectorAuthMethodRequired', {
                provider: definition.provider,
                defaultValue: `Connector '${definition.provider}' requires an authentication method`
            })
        )
    }
    const selected = methods.find((method) => method.id === (authMethodId ?? methods[0]?.id))
    if (!selected) {
        throw new BadRequestException(
            t('server-ai:Error.ConnectorAuthMethodUnsupported', {
                provider: definition.provider,
                method: authMethodId ?? '',
                defaultValue: `Connector '${definition.provider}' does not support authentication method '${authMethodId ?? ''}'`
            })
        )
    }
    return selected
}

function resolveStoredAuthMethodId(connector: Connector, definition: ConnectorStrategyDefinition) {
    if (connector.authMethodId) {
        return resolveAuthMethod(definition, connector.authMethodId).id
    }
    if (definition.legacyAuthMethodId) {
        return resolveAuthMethod(definition, definition.legacyAuthMethodId).id
    }
    const methods = getConnectorAuthMethods(definition)
    if (methods.length !== 1) {
        throw new BadRequestException(
            t('server-ai:Error.ConnectorStoredAuthMethodMissing', {
                provider: definition.provider,
                defaultValue: `Connector '${definition.provider}' is missing its authentication method and cannot be resolved automatically`
            })
        )
    }
    return methods[0].id
}

function resolveSessionAuthMethodId(
    metadata: ConnectorSessionMetadata,
    connector: Connector,
    definition: ConnectorStrategyDefinition
) {
    const authMethodId = metadata.authMethodId
        ? resolveAuthMethod(definition, metadata.authMethodId).id
        : resolveStoredAuthMethodId(connector, definition)
    if (connector.authMethodId && connector.authMethodId !== authMethodId) {
        throw new BadRequestException(OAUTH_SESSION_EXPIRED_ERROR)
    }
    return authMethodId
}

function resolveConnectorValues(authMethod: ConnectorAuthMethodDefinition, input: ConnectorConnectRequest) {
    const form = authMethod.type === 'oauth2' ? authMethod.appCredentials : authMethod.credentials
    const raw = input.values ?? input.app
    if (raw != null && !isRecord(raw)) {
        throw new BadRequestException(
            t('server-ai:Error.ConnectorCredentialValuesInvalid', {
                defaultValue: 'Connector credential values are invalid'
            })
        )
    }
    if (raw && !form) {
        throw new BadRequestException(
            t('server-ai:Error.ConnectorCredentialValuesNotAccepted', {
                defaultValue: 'Connector authentication method does not accept credential values'
            })
        )
    }

    const defaults = form?.defaultValues ?? {}
    const values = raw
        ? parseConnectorValues(input.values ? { ...defaults, ...raw } : { ...raw, ...defaults })
        : Object.keys(defaults).length
          ? parseConnectorValues(defaults)
          : undefined
    const missing = (form?.fields ?? [])
        .filter((field) => field.required && !hasCredentialValue(values?.[field.name]))
        .map((field) => field.name)
    if (missing.length) {
        throw new BadRequestException(
            t('server-ai:Error.ConnectorCredentialValuesRequired', {
                fields: missing.join(', '),
                defaultValue: `Connector credential values are required: ${missing.join(', ')}`
            })
        )
    }
    return values
}

function legacyScopes(definition: ConnectorStrategyDefinition) {
    return definition.auth?.type === 'oauth2' ? definition.auth.scopes : undefined
}

function normalizeLegacyCredential(
    credential: ConnectorOAuthCredential,
    fallbackApp?: Record<string, unknown>
): ConnectorCredential {
    return {
        data: {
            appId: credential.appId,
            ...(credential.brand ? { brand: credential.brand } : {}),
            app: credential.app ? parseConnectorValues(credential.app) : fallbackApp,
            accessToken: credential.accessToken,
            ...(credential.refreshToken ? { refreshToken: credential.refreshToken } : {})
        },
        expiresAt: credential.expiresAt,
        refreshExpiresAt: credential.refreshExpiresAt,
        scopes: credential.scopes,
        profile: credential.profile
    }
}

function normalizeLegacyPollResult(
    result: Awaited<ReturnType<NonNullable<ConnectorStrategyRuntime['pollAuthorization']>>>,
    values?: Record<string, unknown>
): ConnectorConnectionPollResult {
    if (result.status !== 'complete') {
        return result
    }
    return {
        ...result,
        credential: normalizeLegacyCredential(result.credential, values)
    }
}

function parseStoredCredential(value: unknown, fallbackAuthMethodId?: string): StoredConnectorCredential {
    if (!isRecord(value)) {
        throw new BadRequestException('Stored connector credential is invalid')
    }
    if (value.version === 1) {
        const authMethodId = stringValue(value.authMethodId)
        if (!authMethodId) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorStoredCredentialAuthMethodMissing', {
                    defaultValue: 'Stored connector credential is missing its authentication method'
                })
            )
        }
        return {
            version: 1,
            authMethodId,
            credential: parseConnectorCredential(value.credential)
        }
    }

    if (!fallbackAuthMethodId) {
        throw new BadRequestException(
            t('server-ai:Error.ConnectorStoredCredentialAuthMethodMissing', {
                defaultValue: 'Stored connector credential is missing its authentication method'
            })
        )
    }

    return {
        version: 1,
        authMethodId: fallbackAuthMethodId,
        credential: parseLegacyStoredCredential(value)
    }
}

function parseConnectorCredential(value: unknown): ConnectorCredential {
    if (!isRecord(value) || !isRecord(value.data)) {
        throw new BadRequestException(
            t('server-ai:Error.ConnectorStoredCredentialDataMissing', {
                defaultValue: 'Stored connector credential is missing credential data'
            })
        )
    }
    const expiresAt = nullableStringValue(value.expiresAt)
    const refreshExpiresAt = nullableStringValue(value.refreshExpiresAt)
    const scopes = value.scopes
    const profile = value.profile
    const parsedProfile = isConnectorProfile(profile) ? profile : profile === null ? null : undefined
    return {
        data: { ...value.data },
        ...(expiresAt !== undefined ? { expiresAt } : {}),
        ...(refreshExpiresAt !== undefined ? { refreshExpiresAt } : {}),
        ...(Array.isArray(scopes) && scopes.every((item) => typeof item === 'string') ? { scopes } : {}),
        ...(parsedProfile !== undefined ? { profile: parsedProfile } : {})
    }
}

function parseLegacyStoredCredential(value: Record<string, unknown>): ConnectorCredential {
    const appId = stringValue(value.appId)
    const accessToken = stringValue(value.accessToken)
    if (!appId || !accessToken) {
        throw new BadRequestException('Stored connector credential is missing required fields')
    }
    return normalizeLegacyCredential({
        appId,
        accessToken,
        brand: stringValue(value.brand),
        app: recordValue(value.app),
        refreshToken: stringValue(value.refreshToken),
        expiresAt: nullableStringValue(value.expiresAt),
        refreshExpiresAt: nullableStringValue(value.refreshExpiresAt),
        scopes:
            Array.isArray(value.scopes) && value.scopes.every((item) => typeof item === 'string')
                ? value.scopes
                : undefined,
        profile: isConnectorProfile(value.profile) ? value.profile : undefined
    })
}

function projectLegacyRuntimeCredential(credential: ConnectorCredential) {
    const data = credential.data
    return {
        ...(stringValue(data.appId) ? { appId: stringValue(data.appId) } : {}),
        ...(stringValue(data.brand) ? { brand: stringValue(data.brand) } : {}),
        ...(stringValue(data.accessToken) ? { accessToken: stringValue(data.accessToken) } : {}),
        ...(stringValue(data.tokenType) ? { tokenType: stringValue(data.tokenType) } : {})
    }
}

function toPublicDefinition(definition: ConnectorStrategyDefinition): ConnectorStrategyDefinition {
    return {
        ...definition,
        authMethods: getConnectorAuthMethods(definition).map((method) =>
            method.type === 'oauth2'
                ? {
                      ...method,
                      appCredentials: sanitizeCredentialForm(method.appCredentials)
                  }
                : {
                      ...method,
                      credentials: sanitizeCredentialForm(method.credentials) ?? { fields: [] }
                  }
        ),
        appCredentials: sanitizeCredentialForm(definition.appCredentials)
    }
}

function sanitizeCredentialForm(form?: ConnectorCredentialFormDefinition) {
    if (!form) {
        return undefined
    }
    const secretFields = new Set(
        (form.fields ?? []).filter((field) => field.secret || field.type === 'password').map((field) => field.name)
    )
    const defaultValues = Object.fromEntries(
        Object.entries(form.defaultValues ?? {}).filter(([name]) => !secretFields.has(name))
    )
    return {
        ...form,
        ...(Object.keys(defaultValues).length ? { defaultValues } : { defaultValues: undefined })
    }
}

function hasLegacyAppIntegrationReference(input: ConnectorConnectRequest) {
    return Object.prototype.hasOwnProperty.call(input, 'appIntegrationId')
}

function hasCredentialPayload(input: ConnectorOAuthCompleteRequest) {
    return Reflect.get(input, 'credential') != null
}

function hasCredentialValue(value: unknown) {
    return value !== undefined && value !== null && (typeof value !== 'string' || !!value.trim())
}

function parseConnectorValues(value: unknown): ConnectorValues {
    if (!isRecord(value)) {
        throw new BadRequestException(
            t('server-ai:Error.ConnectorCredentialValuesInvalid', {
                defaultValue: 'Connector credential values are invalid'
            })
        )
    }

    return { ...value }
}

function stringValue(value: unknown) {
    return typeof value === 'string' && value ? value : undefined
}

function nullableStringValue(value: unknown): string | null | undefined {
    return value === null ? null : stringValue(value)
}

function recordValue(value: unknown) {
    return isRecord(value) ? { ...value } : undefined
}

function isConnectorProfile(value: unknown): value is ConnectorProfile {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}
