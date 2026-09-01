import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
    Optional
} from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { OnEvent } from '@nestjs/event-emitter'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, type EntityManager, type FindOptionsWhere } from 'typeorm'
import { decryptSecret, encryptSecret, RequestContext } from '@xpert-ai/server-core'
import { environment } from '@xpert-ai/server-config'
import { t } from 'i18next'
import {
    assertConnectorDefinition,
    ConnectorStrategyRegistry,
    getConnectorAuthorizationModes,
    getConnectorAuthMethods
} from '@xpert-ai/plugin-sdk'
import type {
    AgentMiddlewareRuntimeScope,
    ConnectorAuthorizationMode,
    ConnectorAuthMethodDefinition,
    ConnectorBinding,
    ConnectorBindingCreateRequest,
    ConnectorConnectRequest,
    ConnectorConnectResponse,
    ConnectorConnectionPollResult,
    ConnectorCredential,
    ConnectorCredentialFormDefinition,
    ConnectorCredentialRevokeReason,
    ConnectorInstance,
    ConnectorOAuthCompleteRequest,
    ConnectorOAuthCredential,
    ConnectorOAuthStatusResponse,
    ConnectorOAuthStartRequest,
    ConnectorOAuthStartResponse,
    ConnectorPersonalAccountInstance,
    ConnectorProfile,
    ConnectorRuntimeApi,
    ConnectorRuntimeCredential,
    ConnectorRuntimeCredentialV2,
    ConnectorRuntimeGetInput,
    ConnectorRuntimeOptions,
    ConnectorScope,
    ConnectorSelectOption,
    ConnectorStrategyDefinition,
    ConnectorStrategyRuntime,
    RuntimeI18nText
} from '@xpert-ai/plugin-sdk'
import { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { ConnectorOAuthSession } from './connector-oauth-session.entity'
import { ConnectorPersonalAccount } from './connector-personal-account.entity'
import { ConnectorPersonalGrant } from './connector-personal-grant.entity'
import { ConnectorRuntimeAudit } from './connector-runtime-audit.entity'
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
    delete?(criteria: FindOptionsWhere<T>): Promise<{ affected?: number | null }>
}

type ConnectorEntityRepository = ConnectorRepository<Connector>
type OAuthSessionRepository = ConnectorRepository<ConnectorOAuthSession>
type PersonalAccountRepository = ConnectorRepository<ConnectorPersonalAccount>
type PersonalGrantRepository = ConnectorRepository<ConnectorPersonalGrant>
type RuntimeAuditRepository = ConnectorRepository<ConnectorRuntimeAudit>

type ConnectorDeletionResult = Promise<{ affected?: number | null }>

type ConnectorDeletionRepositories = {
    findProjectBindings(input: { tenantId: string; projectId: string }): Promise<Connector[]>
    findSessions(input: { tenantId: string; connectorId: string }): Promise<ConnectorOAuthSession[]>
    deleteSessions?(input: { tenantId: string; connectorId: string }): ConnectorDeletionResult
    deletePersonalGrants?(input: { tenantId: string; connectorId: string }): ConnectorDeletionResult
    deleteConnector?(input: { id: string; tenantId: string }): ConnectorDeletionResult
}

type ConnectorAccessService = Pick<XpertWorkspaceAccessService, 'assertCanRead' | 'assertCanManage' | 'assertCanRun'>

type ConnectorStrategyRegistryService = Pick<ConnectorStrategyRegistry, 'getRuntime' | 'listRuntime'>

type ConnectorConnectServiceInput = ConnectorConnectRequest & {
    redirectUri: string
}

type CredentialOwner = Connector | ConnectorPersonalAccount
type CredentialOwnerKind = 'shared' | 'personal'
type CredentialOwnerUpdate = Partial<
    Pick<
        CredentialOwner,
        | 'authMethodId'
        | 'connectionAttemptId'
        | 'status'
        | 'profile'
        | 'scopes'
        | 'credentialCiphertext'
        | 'expiresAt'
        | 'refreshExpiresAt'
        | 'connectedAt'
        | 'disconnectedAt'
        | 'lastError'
        | 'updatedById'
    >
>

type BindingConnection = {
    binding: Connector
    owner: CredentialOwner
    ownerKind: CredentialOwnerKind
}

type StartOAuthInput = ConnectorOAuthStartRequest & {
    redirectUri: string
}

type ConnectorValues = Record<string, unknown>

export const EVENT_XPERT_PROJECT_MEMBER_REMOVED = 'xpert-project.member-removed'

export type XpertProjectMemberRemovedEvent = {
    tenantId: string
    organizationId: string
    projectId: string
    userId: string
    actorId: string
}

export type SelectedRuntimeConnectorBinding = {
    bindingId: string
    provider: string
}

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
        private readonly connectorStrategyRegistry: ConnectorStrategyRegistryService,
        @Optional()
        @InjectRepository(ConnectorPersonalAccount)
        private readonly personalAccountRepository?: PersonalAccountRepository,
        @Optional()
        @InjectRepository(ConnectorPersonalGrant)
        private readonly personalGrantRepository?: PersonalGrantRepository,
        @Optional()
        @InjectRepository(ConnectorRuntimeAudit)
        private readonly runtimeAuditRepository?: RuntimeAuditRepository,
        @Optional()
        @Inject(ModuleRef)
        private readonly moduleRef?: ModuleRef
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

    async listBindings(scope: ConnectorScope): Promise<ConnectorBinding[]> {
        const normalizedScope = normalizeConnectorScope(scope)
        await this.assertScopeRead(normalizedScope)
        const bindings = await this.findBindings(normalizedScope)
        const userId = RequestContext.currentUserId()

        return Promise.all(
            bindings.map(async (binding) => {
                if (connectorAuthorizationMode(binding) !== 'personal' || !userId) {
                    return this.toPublicBinding(binding)
                }
                const connection = await this.findPersonalBindingConnection(binding, userId)
                return this.toPublicBinding(binding, connection?.owner)
            })
        )
    }

    async definitionsForScope(scope: ConnectorScope): Promise<ConnectorStrategyDefinition[]> {
        const access = await this.assertScopeRead(normalizeConnectorScope(scope))
        return this.connectorStrategyRegistry
            .listRuntime(access.organizationId)
            .map((strategy) => toPublicDefinition(strategy.definition))
    }

    async createBinding(input: ConnectorBindingCreateRequest): Promise<ConnectorBinding> {
        const scope = normalizeConnectorScope(input.scope)
        const provider = requiredConnectorText(input.provider, 'provider')
        const authorizationMode = parseAuthorizationMode(input.authorizationMode)
        const access = await this.assertScopeManage(scope)
        const tenantId = RequestContext.currentTenantId()
        const userId = RequestContext.currentUserId()
        const strategy = this.connectorStrategyRegistry.getRuntime(provider, access.organizationId)
        assertConnectorDefinition(strategy.definition)
        assertAuthorizationModeSupported(strategy.definition, authorizationMode)

        const existing = await this.connectorRepository.findOne({
            where: {
                tenantId,
                ...scopeWhere(scope),
                provider
            }
        })
        if (existing) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorBindingAlreadyExists', {
                    provider,
                    defaultValue: `Connector '${provider}' is already configured for this scope`
                })
            )
        }

        const binding = await this.connectorRepository.save(
            this.connectorRepository.create({
                tenantId,
                organizationId: access.organizationId,
                scopeType: scope.type,
                ...scopeWhere(scope),
                provider,
                authorizationMode,
                status: authorizationMode === 'personal' ? 'active' : 'disconnected',
                authMethodId: null,
                connectionAttemptId: null,
                appIntegrationId: null,
                profile: null,
                scopes: null,
                credentialCiphertext: null,
                expiresAt: null,
                refreshExpiresAt: null,
                connectedAt: null,
                disconnectedAt: null,
                lastError: null,
                createdById: userId,
                updatedById: userId
            })
        )
        return this.toPublicBinding(binding)
    }

    async runtimeOptions(xpertId: string, projectId?: string): Promise<ConnectorRuntimeOptions> {
        const xpert = await this.assertXpertRunAccess(requiredConnectorText(xpertId, 'xpertId'))
        const scope = projectId
            ? ({ type: 'project', projectId: requiredConnectorText(projectId, 'projectId') } as const)
            : ({
                  type: 'workspace',
                  workspaceId: requiredConnectorText(xpert.workspaceId, 'xpert.workspaceId')
              } as const)

        const projectAccess =
            scope.type === 'project' ? await this.assertProjectUseXpert(scope.projectId, xpertId) : null

        const bindings = await this.findBindings(scope)
        const organizationId = projectAccess?.project.organizationId ?? xpert.workspace?.organizationId
        const definitions = new Map(
            this.connectorStrategyRegistry
                .listRuntime(organizationId)
                .map((strategy) => [strategy.definition.provider, toPublicDefinition(strategy.definition)])
        )
        const userId = RequestContext.currentUserId()
        const canUseShared =
            scope.type === 'project' ? true : await this.isCurrentWorkspaceMember(scope.workspaceId, userId)
        const items: ConnectorRuntimeOptions['items'] = []

        for (const binding of bindings) {
            const definition = definitions.get(binding.provider)
            if (!definition) {
                continue
            }
            const authorizationMode = connectorAuthorizationMode(binding)
            if (authorizationMode === 'shared') {
                if (!canUseShared) {
                    continue
                }
                items.push({
                    bindingId: binding.id,
                    provider: binding.provider,
                    authorizationMode,
                    status: binding.status,
                    granted: binding.status === 'active',
                    label: definition.label,
                    description: definition.description,
                    icon: definition.icon,
                    authMethods: getConnectorAuthMethods(definition),
                    profile: binding.profile ?? null
                })
                continue
            }

            const personal = userId ? await this.findPersonalBindingConnection(binding, userId) : null
            items.push({
                bindingId: binding.id,
                provider: binding.provider,
                authorizationMode,
                status: personal?.owner.status ?? 'disconnected',
                granted: !!personal && personal.owner.status === 'active',
                label: definition.label,
                description: definition.description,
                icon: definition.icon,
                authMethods: getConnectorAuthMethods(definition),
                profile: personal?.owner.profile ?? null
            })
        }

        return { scope, items }
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
        assertAuthorizationModeSupported(strategy.definition, 'shared')

        const existing = await this.connectorRepository.findOne({
            where: {
                tenantId,
                workspaceId,
                provider
            }
        })
        if (existing && connectorAuthorizationMode(existing) !== 'shared') {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorAuthorizationModeImmutable', {
                    defaultValue: 'Connector authorization mode cannot be changed after creation'
                })
            )
        }
        const connector = this.connectorRepository.create({
            ...(existing ?? {}),
            tenantId,
            organizationId,
            scopeType: 'workspace',
            workspaceId,
            projectId: null,
            provider,
            authorizationMode: 'shared',
            updatedById: userId,
            createdById: existing?.createdById ?? userId
        })

        const savedConnector = await this.connectorRepository.save(connector)
        return this.startBindingConnection(
            { binding: savedConnector, owner: savedConnector, ownerKind: 'shared' },
            input,
            strategy
        )
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

    async connectBinding(connectorId: string, input: ConnectorConnectServiceInput): Promise<ConnectorConnectResponse> {
        if (hasLegacyAppIntegrationReference(input)) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorAppIntegrationUnsupported', {
                    defaultValue: 'Connector app integrations are not supported'
                })
            )
        }

        const binding = await this.requireBinding(connectorId)
        const authorizationMode = connectorAuthorizationMode(binding)
        if (authorizationMode === 'shared') {
            await this.assertBindingManage(binding)
            if (input.xpertId) {
                await this.assertBindingXpert(binding, input.xpertId)
            }
        } else {
            await this.assertBindingUse(binding, input.xpertId)
        }
        const strategy = this.connectorStrategyRegistry.getRuntime(binding.provider, binding.organizationId)
        assertConnectorDefinition(strategy.definition)
        assertAuthorizationModeSupported(strategy.definition, authorizationMode)

        const owner =
            authorizationMode === 'shared'
                ? binding
                : await this.requireOrCreatePersonalAccount(binding.provider, RequestContext.currentUserId())
        return this.startBindingConnection(
            {
                binding,
                owner,
                ownerKind: authorizationMode
            },
            input,
            strategy
        )
    }

    private async startBindingConnection(
        connection: BindingConnection,
        input: ConnectorConnectServiceInput,
        strategy: ConnectorStrategyRuntime
    ): Promise<ConnectorConnectResponse> {
        const { binding } = connection
        const tenantId = RequestContext.currentTenantId()
        const userId = requiredConnectorText(RequestContext.currentUserId(), 'userId')
        const authMethod = resolveAuthMethod(strategy.definition, input.authMethodId)
        const values = resolveConnectorValues(authMethod, input)
        const connectionAttemptId = randomUUID()
        if (connection.ownerKind === 'shared') {
            await this.revokeSharedCredential(connection.binding, 'rotate', strategy)
        }
        Object.assign(connection.owner, {
            authMethodId: authMethod.id,
            connectionAttemptId,
            status: 'pending',
            profile: null,
            scopes: null,
            credentialCiphertext: null,
            expiresAt: null,
            refreshExpiresAt: null,
            connectedAt: null,
            disconnectedAt: null,
            lastError: null,
            updatedById: userId
        } satisfies Partial<CredentialOwner>)
        const savedOwner = await this.saveCredentialOwner(connection.ownerKind, connection.owner)
        const currentConnection = { ...connection, owner: savedOwner }
        await this.consumeSupersededSessions(currentConnection)
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
                const activated = await this.activateCredentialOwner(
                    currentConnection,
                    authMethod.id,
                    connectionAttemptId,
                    result.credential,
                    legacyScopes(strategy.definition)
                )
                await this.ensurePersonalGrant(currentConnection, activated)
                return {
                    status: 'active',
                    connector: this.toPublicConnector(binding, activated)
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
                currentConnection,
                connectionAttemptId,
                error instanceof Error
                    ? error.message
                    : t('server-ai:Error.ConnectorAuthorizationStartFailed', {
                          defaultValue: 'Connector authorization could not be started'
                      })
            )
            throw error
        }

        const savedSession = await this.sessionRepository.save(
            this.sessionRepository.create({
                tenantId,
                organizationId: binding.organizationId,
                scopeType: connectorScopeType(binding),
                workspaceId: binding.workspaceId ?? null,
                projectId: binding.projectId ?? null,
                authorizationMode: connectorAuthorizationMode(binding),
                connectorId: binding.id,
                personalAccountId: currentConnection.ownerKind === 'personal' ? savedOwner.id : null,
                actorUserId: userId,
                xpertId: optionalConnectorText(input.xpertId, 'xpertId'),
                connectionAttemptId,
                provider: binding.provider,
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
        const currentOwner = await this.findCurrentCredentialOwner(currentConnection)
        if (
            !currentOwner ||
            currentOwner.status !== 'pending' ||
            currentOwner.connectionAttemptId !== connectionAttemptId
        ) {
            await this.consumeOAuthSession(savedSession)
            throw new BadRequestException(connectorOAuthSessionExpiredMessage())
        }

        return {
            status: 'pending',
            connector: this.toPublicConnector(binding, currentOwner),
            authorizationUrl: result.authorizationUrl,
            stateExpiresAt: stateExpiresAt.toISOString(),
            pollIntervalSeconds: result.pollIntervalSeconds ?? null
        }
    }

    async consentPersonalBinding(connectorId: string, xpertId?: string): Promise<ConnectorBinding> {
        const binding = await this.requireBinding(connectorId)
        if (connectorAuthorizationMode(binding) !== 'personal') {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorPersonalConsentUnsupported', {
                    defaultValue: 'Only personal connectors can use account consent'
                })
            )
        }
        await this.assertBindingUse(binding, xpertId)
        const account = await this.findPersonalAccount(binding.provider, RequestContext.currentUserId())
        if (!account || account.status !== 'active' || !account.credentialCiphertext) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorPersonalAccountRequired', {
                    defaultValue: 'Connect a personal account before granting this connector access'
                })
            )
        }
        await this.ensurePersonalGrant({ binding, owner: account, ownerKind: 'personal' }, account)
        return this.toPublicBinding(binding, account)
    }

    async listPersonalAccounts(): Promise<ConnectorPersonalAccountInstance[]> {
        const repository = this.requirePersonalAccountRepository()
        const tenantId = RequestContext.currentTenantId()
        const userId = RequestContext.currentUserId()
        const accounts = await repository.find({ where: { tenantId, userId } })
        return accounts.map((account) => this.toPublicPersonalAccount(account))
    }

    async disconnectPersonalAccount(accountId: string) {
        const repository = this.requirePersonalAccountRepository()
        const tenantId = RequestContext.currentTenantId()
        const userId = RequestContext.currentUserId()
        const account = await repository.findOne({ where: { id: accountId, tenantId, userId } })
        if (!account) {
            throw new NotFoundException(
                t('server-ai:Error.ConnectorPersonalAccountNotFound', {
                    defaultValue: 'Connector personal account was not found'
                })
            )
        }
        Object.assign(account, disconnectedCredentialState())
        await repository.save(account)
        if (this.personalGrantRepository?.delete) {
            await this.personalGrantRepository.delete({ tenantId, accountId, userId })
        }
        const sessions = await this.sessionRepository.find({ where: { tenantId, personalAccountId: accountId } })
        await Promise.all(
            sessions.filter((session) => !session.consumedAt).map((session) => this.consumeOAuthSession(session))
        )
        return null
    }

    async deleteBinding(connectorId: string) {
        const binding = await this.requireBinding(connectorId)
        await this.assertBindingManage(binding)
        await this.deleteBindingRecords(binding, this.deletionRepositories())
        return null
    }

    async deleteProjectBindings(input: { projectId: string; tenantId: string }, manager?: EntityManager) {
        const repositories = this.deletionRepositories(manager)
        const bindings = await repositories.findProjectBindings(input)
        for (const binding of bindings) {
            await this.deleteBindingRecords(binding, repositories)
        }
    }

    private async deleteBindingRecords(binding: Connector, repositories: ConnectorDeletionRepositories) {
        await this.revokeSharedCredential(binding, 'delete')
        const sessions = await repositories.findSessions({ tenantId: binding.tenantId, connectorId: binding.id })
        if (repositories.deleteSessions) {
            await repositories.deleteSessions({ tenantId: binding.tenantId, connectorId: binding.id })
        } else {
            await Promise.all(
                sessions.filter((session) => !session.consumedAt).map((session) => this.consumeOAuthSession(session))
            )
        }
        if (repositories.deletePersonalGrants) {
            await repositories.deletePersonalGrants({ tenantId: binding.tenantId, connectorId: binding.id })
        }
        if (!repositories.deleteConnector) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorBindingDeletionUnavailable', {
                    defaultValue: 'Connector binding deletion is not available'
                })
            )
        }
        await repositories.deleteConnector({ id: binding.id, tenantId: binding.tenantId })
    }

    private deletionRepositories(manager?: EntityManager): ConnectorDeletionRepositories {
        if (manager) {
            const connectors = manager.getRepository(Connector)
            const sessions = manager.getRepository(ConnectorOAuthSession)
            const personalGrants = manager.getRepository(ConnectorPersonalGrant)
            return {
                findProjectBindings: ({ tenantId, projectId }) =>
                    connectors.find({ where: { tenantId, scopeType: 'project', projectId } }),
                findSessions: ({ tenantId, connectorId }) => sessions.find({ where: { tenantId, connectorId } }),
                deleteSessions: ({ tenantId, connectorId }) => sessions.delete({ tenantId, connectorId }),
                deletePersonalGrants: ({ tenantId, connectorId }) => personalGrants.delete({ tenantId, connectorId }),
                deleteConnector: ({ id, tenantId }) => connectors.delete({ id, tenantId })
            }
        }

        const deleteConnector = this.connectorRepository.delete
        const deleteSessions = this.sessionRepository.delete
        const deletePersonalGrants = this.personalGrantRepository?.delete
        return {
            findProjectBindings: ({ tenantId, projectId }) =>
                this.connectorRepository.find({ where: { tenantId, scopeType: 'project', projectId } }),
            findSessions: ({ tenantId, connectorId }) =>
                this.sessionRepository.find({ where: { tenantId, connectorId } }),
            ...(deleteSessions
                ? {
                      deleteSessions: (input: { tenantId: string; connectorId: string }) =>
                          deleteSessions.call(this.sessionRepository, input)
                  }
                : {}),
            ...(deletePersonalGrants && this.personalGrantRepository
                ? {
                      deletePersonalGrants: (input: { tenantId: string; connectorId: string }) =>
                          deletePersonalGrants.call(this.personalGrantRepository, input)
                  }
                : {}),
            ...(deleteConnector
                ? {
                      deleteConnector: (input: { id: string; tenantId: string }) =>
                          deleteConnector.call(this.connectorRepository, input)
                  }
                : {})
        }
    }

    @OnEvent(EVENT_XPERT_PROJECT_MEMBER_REMOVED, { suppressErrors: false })
    async revokeProjectMemberGrants(event: XpertProjectMemberRemovedEvent) {
        if (!this.personalGrantRepository?.delete) {
            return
        }
        const bindings = await this.connectorRepository.find({
            where: {
                tenantId: event.tenantId,
                organizationId: event.organizationId,
                scopeType: 'project',
                projectId: event.projectId
            }
        })
        await Promise.all(
            bindings.map(async (binding) => {
                const sessions = await this.sessionRepository.find({
                    where: {
                        tenantId: event.tenantId,
                        connectorId: binding.id,
                        actorUserId: event.userId
                    }
                })
                await Promise.all(
                    sessions
                        .filter((session) => !session.consumedAt)
                        .map((session) => this.cancelRemovedProjectMemberSession(binding, session, event))
                )
                await this.personalGrantRepository?.delete?.({
                    tenantId: event.tenantId,
                    connectorId: binding.id,
                    userId: event.userId
                })
            })
        )
    }

    private async cancelRemovedProjectMemberSession(
        binding: Connector,
        session: ConnectorOAuthSession,
        event: XpertProjectMemberRemovedEvent
    ) {
        const connectionAttemptId = this.sessionConnectionAttemptId(session)
        await this.consumeOAuthSession(session)
        if (!connectionAttemptId) {
            return
        }
        const update = {
            ...disconnectedCredentialState(),
            updatedById: event.actorId
        }
        if (sessionAuthorizationMode(session) === 'personal' && session.personalAccountId) {
            await this.requirePersonalAccountRepository().update(
                {
                    id: session.personalAccountId,
                    tenantId: event.tenantId,
                    userId: event.userId,
                    status: 'pending',
                    connectionAttemptId
                },
                update
            )
            return
        }
        await this.connectorRepository.update(
            {
                id: binding.id,
                tenantId: event.tenantId,
                status: 'pending',
                connectionAttemptId
            },
            update
        )
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
        const connector = await this.requireConnector({ workspaceId, connectorId, authorizationMode: 'shared' })
        return this.authorizationStatusForConnection({ binding: connector, owner: connector, ownerKind: 'shared' })
    }

    async authorizationStatusBinding(connectorId: string, xpertId?: string): Promise<ConnectorOAuthStatusResponse> {
        const binding = await this.requireBinding(connectorId)
        const authorizationMode = connectorAuthorizationMode(binding)
        if (authorizationMode === 'shared') {
            await this.assertBindingManage(binding)
            const status = await this.authorizationStatusForConnection({ binding, owner: binding, ownerKind: 'shared' })
            return { ...status, granted: status.connector.status === 'active' }
        }
        await this.assertBindingUse(binding, xpertId)
        const userId = RequestContext.currentUserId()
        const account = await this.findPersonalAccount(binding.provider, userId)
        if (!account) {
            return { connector: this.toPublicConnector(binding), granted: false }
        }
        const grant = userId ? await this.findPersonalBindingConnection(binding, userId) : null
        const status = await this.authorizationStatusForConnection({ binding, owner: account, ownerKind: 'personal' })
        return { ...status, granted: !!grant && status.connector.status === 'active' }
    }

    private async authorizationStatusForConnection(
        connection: BindingConnection
    ): Promise<ConnectorOAuthStatusResponse> {
        const { binding, owner } = connection
        const sessions = await this.sessionRepository.find({
            where: {
                tenantId: binding.tenantId,
                connectorId: binding.id,
                provider: binding.provider,
                authorizationMode: connectorAuthorizationMode(binding),
                ...(connection.ownerKind === 'personal'
                    ? { personalAccountId: owner.id, actorUserId: RequestContext.currentUserId() }
                    : {})
            }
        })
        const openSessions = sessions.filter((item) => !item.consumedAt)
        const currentSessions = openSessions.filter((item) => this.isCurrentSession(item, owner))
        const session = currentSessions
            .filter((item) => item.expiresAt.getTime() >= Date.now())
            .sort((left, right) => right.expiresAt.getTime() - left.expiresAt.getTime())[0]

        if (!session || owner.status !== 'pending') {
            const expiredSession = currentSessions.sort(
                (left, right) => right.expiresAt.getTime() - left.expiresAt.getTime()
            )[0]
            if (!session && owner.status === 'pending' && expiredSession) {
                const expiredOwner = await this.expireOAuthSession(
                    expiredSession,
                    connection,
                    this.sessionConnectionAttemptId(expiredSession)
                )
                return {
                    connector: this.toPublicConnector(binding, expiredOwner),
                    authorizationUrl: null,
                    stateExpiresAt: expiredSession.expiresAt.toISOString(),
                    pollIntervalSeconds: null,
                    message: connectorOAuthSessionExpiredMessage()
                }
            }
            return {
                connector: this.toPublicConnector(binding, owner),
                authorizationUrl: session?.authorizationUrl ?? null,
                stateExpiresAt: session?.expiresAt?.toISOString() ?? null,
                pollIntervalSeconds: session?.pollIntervalSeconds ?? null
            }
        }

        const strategy = this.connectorStrategyRegistry.getRuntime(binding.provider, binding.organizationId)
        const metadata = this.decryptSessionMetadata(session.metadataCiphertext)
        const authMethodId = resolveSessionAuthMethodId(metadata, owner, strategy.definition)
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
                connector: this.toPublicConnector(binding, owner),
                authorizationUrl: session.authorizationUrl ?? null,
                stateExpiresAt: session.expiresAt.toISOString(),
                pollIntervalSeconds: session.pollIntervalSeconds ?? null
            }
        }

        return this.applyAuthorizationPollResult(
            session,
            connection,
            this.sessionConnectionAttemptId(session),
            authMethodId,
            result
        )
    }

    private async consumeSupersededSessions(value: Connector | BindingConnection) {
        const connection = isBindingConnection(value)
            ? value
            : { binding: value, owner: value, ownerKind: 'shared' as const }
        const { binding, owner } = connection
        const sessions = await this.sessionRepository.find({
            where: {
                tenantId: binding.tenantId,
                provider: binding.provider,
                ...(connection.ownerKind === 'personal' ? { personalAccountId: owner.id } : { connectorId: binding.id })
            }
        })
        const currentOwner = await this.findCurrentCredentialOwner(connection)
        const currentAttemptId = currentOwner?.connectionAttemptId ?? null
        await Promise.all(
            sessions
                .filter((session) => {
                    if (session.consumedAt) {
                        return false
                    }
                    return !currentAttemptId || this.sessionConnectionAttemptId(session) !== currentAttemptId
                })
                .map((session) => this.consumeOAuthSession(session))
        )
    }

    private async consumeOAuthSession(session: ConnectorOAuthSession) {
        session.consumedAt = new Date()
        session.metadataCiphertext = null
        await this.sessionRepository.save(session)
    }

    private isCurrentSession(session: ConnectorOAuthSession, owner: CredentialOwner) {
        const connectionAttemptId = this.sessionConnectionAttemptId(session)
        return connectionAttemptId ? connectionAttemptId === owner.connectionAttemptId : !owner.connectionAttemptId
    }

    private sessionConnectionAttemptId(session: ConnectorOAuthSession) {
        return (
            session.connectionAttemptId ?? this.decryptSessionMetadata(session.metadataCiphertext).connectionAttemptId
        )
    }

    async getOAuthCallbackContext(
        state: string
    ): Promise<{ connectorId: string; scope: ConnectorScope; workspaceId?: string } | null> {
        if (!state) {
            return null
        }
        const session = await this.sessionRepository.findOne({
            where: {
                stateHash: hashState(state)
            }
        })
        if (!session) {
            return null
        }
        const scope = sessionScope(session)
        return {
            connectorId: session.connectorId,
            scope,
            ...(scope.type === 'workspace' ? { workspaceId: scope.workspaceId } : {})
        }
    }

    createOAuthBrowserBinding(state: string) {
        return createHmac('sha256', this.encryptionKey).update(`connector-oauth:${state}`).digest('base64url')
    }

    assertOAuthBrowserBinding(state: string, browserBinding?: string) {
        const expected = Buffer.from(this.createOAuthBrowserBinding(state))
        const actual = Buffer.from(browserBinding ?? '')
        if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorOAuthBrowserBindingInvalid', {
                    defaultValue: 'This connector authorization was started in another browser session or has expired.'
                })
            )
        }
    }

    async completeOAuthCallback(input: ConnectorOAuthCompleteRequest): Promise<ConnectorInstance> {
        const state = isRecord(input) ? stringValue(input.state) : undefined
        const code = isRecord(input) ? stringValue(input.code) : undefined
        if (hasCredentialPayload(input)) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorOAuthCallbackCredentialPayloadRejected', {
                    defaultValue: 'Connector OAuth callback does not accept credential payloads'
                })
            )
        }
        if (!code) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorOAuthCallbackCodeRequired', {
                    defaultValue: 'Connector OAuth callback requires an authorization code'
                })
            )
        }
        if (!state) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorOAuthStateInvalid', { defaultValue: 'Invalid connector OAuth state' })
            )
        }

        const session = await this.sessionRepository.findOne({
            where: {
                stateHash: hashState(state)
            }
        })

        if (!session) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorOAuthStateInvalid', { defaultValue: 'Invalid connector OAuth state' })
            )
        }

        const connector = await this.connectorRepository.findOne({
            where: {
                id: session.connectorId,
                tenantId: session.tenantId,
                provider: session.provider
            }
        })

        if (!connector) {
            throw new NotFoundException(
                t('server-ai:Error.ConnectorNotFound', {
                    defaultValue: 'Connector was not found'
                })
            )
        }
        assertSessionBinding(session, connector)
        const connection = await this.resolveSessionConnection(session, connector)

        if (session.consumedAt) {
            throw new BadRequestException(connectorOAuthSessionExpiredMessage())
        }
        const metadata = this.decryptSessionMetadata(session.metadataCiphertext)
        if (!this.isCurrentSession(session, connection.owner)) {
            await this.consumeOAuthSession(session)
            throw new BadRequestException(connectorOAuthSessionExpiredMessage())
        }
        if (session.expiresAt.getTime() < Date.now()) {
            await this.expireOAuthSession(session, connection, this.sessionConnectionAttemptId(session))
            throw new BadRequestException(connectorOAuthSessionExpiredMessage())
        }

        const { authMethodId, credential } = await this.exchangeOAuthCode(session, connection.owner, metadata, code)
        const activated = await this.activateCredentialOwner(
            connection,
            authMethodId,
            this.sessionConnectionAttemptId(session),
            credential,
            session.scopes
        )
        await this.ensurePersonalGrant(connection, activated)
        await this.consumeOAuthSession(session)
        return this.toPublicConnector(connector, activated)
    }

    private async expireOAuthSession(
        session: ConnectorOAuthSession,
        connection: BindingConnection,
        connectionAttemptId?: string
    ) {
        await this.consumeOAuthSession(session)

        if (connection.owner.status === 'pending') {
            const updated = await this.updatePendingCredentialOwner(connection, connectionAttemptId, {
                status: 'expired',
                lastError: connectorOAuthSessionExpiredMessage()
            })
            if (updated) {
                return updated
            }
        }

        return (await this.findCurrentCredentialOwner(connection)) ?? connection.owner
    }

    private async applyAuthorizationPollResult(
        session: ConnectorOAuthSession,
        connection: BindingConnection,
        connectionAttemptId: string | undefined,
        authMethodId: string,
        result: ConnectorConnectionPollResult
    ): Promise<ConnectorOAuthStatusResponse> {
        const currentOwner = await this.findCurrentCredentialOwner(connection)
        if (
            !currentOwner ||
            currentOwner.status !== 'pending' ||
            (connectionAttemptId
                ? currentOwner.connectionAttemptId !== connectionAttemptId
                : !!currentOwner.connectionAttemptId)
        ) {
            await this.consumeOAuthSession(session)
            throw new BadRequestException(connectorOAuthSessionExpiredMessage())
        }

        if (result.status === 'pending') {
            session.authorizationUrl = result.authorizationUrl ?? session.authorizationUrl ?? null
            session.pollIntervalSeconds = result.pollIntervalSeconds ?? session.pollIntervalSeconds ?? null
            session.metadataCiphertext = this.updateStrategyMetadata(session.metadataCiphertext, result.metadata)
            await this.sessionRepository.save(session)

            return {
                connector: this.toPublicConnector(connection.binding, currentOwner),
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
            const activated = await this.activateCredentialOwner(
                { ...connection, owner: currentOwner },
                authMethodId,
                connectionAttemptId,
                result.credential,
                session.scopes
            )
            await this.ensurePersonalGrant(connection, activated)
            await this.consumeOAuthSession(session)
            return {
                connector: this.toPublicConnector(connection.binding, activated),
                authorizationUrl: null,
                stateExpiresAt: session.expiresAt.toISOString(),
                pollIntervalSeconds: null
            }
        }

        const updated = await this.updatePendingCredentialOwner(
            { ...connection, owner: currentOwner },
            connectionAttemptId,
            {
                status: 'error',
                lastError: result.error
            }
        )
        await this.consumeOAuthSession(session)
        if (!updated) {
            throw new BadRequestException(connectorOAuthSessionExpiredMessage())
        }
        return {
            connector: this.toPublicConnector(connection.binding, updated),
            authorizationUrl: session.authorizationUrl ?? null,
            stateExpiresAt: session.expiresAt.toISOString(),
            pollIntervalSeconds: session.pollIntervalSeconds ?? null,
            message: result.error
        }
    }

    private async activateCredentialOwner(
        connection: BindingConnection,
        authMethodId: string,
        connectionAttemptId: string | undefined,
        credential: ConnectorCredential,
        fallbackScopes?: string[] | null
    ): Promise<CredentialOwner> {
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
        const updated = await this.updatePendingCredentialOwner(connection, connectionAttemptId, {
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
            throw new BadRequestException(connectorOAuthSessionExpiredMessage())
        }
        return updated
    }

    private async markConnectionError(connection: BindingConnection, connectionAttemptId: string, message: string) {
        await this.updatePendingCredentialOwner(connection, connectionAttemptId, {
            status: 'error',
            lastError: message
        })
    }

    private async updatePendingCredentialOwner(
        connection: BindingConnection,
        connectionAttemptId: string | undefined,
        input: CredentialOwnerUpdate
    ) {
        const { owner } = connection
        if (!owner.id) {
            return null
        }

        const criteria = {
            id: owner.id,
            status: 'pending' as const,
            ...(connectionAttemptId ? { connectionAttemptId } : { connectionAttemptId: IsNull() })
        }

        const result = await this.updateCredentialOwner(connection.ownerKind, criteria, input)
        if (result.affected !== 1) {
            return null
        }
        return this.findCurrentCredentialOwner(connection)
    }

    private findCurrentConnector(connector: Connector) {
        return this.connectorRepository.findOne({
            where: {
                id: connector.id,
                tenantId: connector.tenantId,
                provider: connector.provider
            }
        })
    }

    private findCurrentCredentialOwner(connection: BindingConnection) {
        if (connection.ownerKind === 'shared') {
            return this.findCurrentConnector(connection.binding)
        }
        const owner = connection.owner
        return this.requirePersonalAccountRepository().findOne({
            where: {
                id: owner.id,
                tenantId: owner.tenantId,
                userId: personalAccountUserId(owner),
                provider: owner.provider
            }
        })
    }

    private async exchangeOAuthCode(
        session: ConnectorOAuthSession,
        owner: CredentialOwner,
        metadata: ConnectorSessionMetadata,
        code: string
    ) {
        const strategy = this.connectorStrategyRegistry.getRuntime(session.provider, session.organizationId)
        const authMethodId = resolveSessionAuthMethodId(metadata, owner, strategy.definition)

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

    private async revokeSharedCredential(
        binding: Connector,
        reason: ConnectorCredentialRevokeReason,
        strategy?: ConnectorStrategyRuntime
    ) {
        if (connectorAuthorizationMode(binding) !== 'shared' || !binding.credentialCiphertext) {
            return
        }

        const providerStrategy =
            strategy ??
            this.connectorStrategyRegistry
                .listRuntime(binding.organizationId)
                .find((candidate) => candidate.definition.provider === binding.provider)
        if (!providerStrategy?.revokeCredential) {
            return
        }

        try {
            const stored = this.decryptCredential(binding, providerStrategy.definition)
            await providerStrategy.revokeCredential({
                authMethodId: stored.authMethodId,
                credential: stored.credential,
                reason
            })
        } catch {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorCredentialRevocationFailed', {
                    provider: binding.provider,
                    defaultValue: `Connector '${binding.provider}' credential could not be revoked. Retry the operation.`
                })
            )
        }
    }

    async disconnect(workspaceId: string, connectorId: string) {
        await this.workspaceAccessService.assertCanManage(workspaceId)
        const connector = await this.requireConnector({ workspaceId, connectorId, authorizationMode: 'shared' })
        await this.revokeSharedCredential(connector, 'disconnect')
        Object.assign(connector, disconnectedCredentialState())
        await this.connectorRepository.save(connector)
        await this.consumeSupersededSessions(connector)
        return null
    }

    async cancelAuthorization(workspaceId: string, connectorId: string) {
        await this.workspaceAccessService.assertCanManage(workspaceId)
        const connector = await this.requireConnector({ workspaceId, connectorId, authorizationMode: 'shared' })
        if (connector.status !== 'pending') {
            throw new BadRequestException('Connector authorization is not pending')
        }

        Object.assign(connector, disconnectedCredentialState())
        await this.connectorRepository.save(connector)
        await this.consumeSupersededSessions(connector)
        return null
    }

    createScopedRuntimeApi(scope: AgentMiddlewareRuntimeScope): ConnectorRuntimeApi {
        return {
            getConnector: (input) => this.getRuntimeConnectorForScope(input, scope),
            getConnectorCredential: (input) => this.getRuntimeConnectorCredentialForScope(input, scope)
        }
    }

    async resolveSelectedRuntimeBindings(
        bindingIds: string[] | null | undefined,
        scope: AgentMiddlewareRuntimeScope
    ): Promise<SelectedRuntimeConnectorBinding[]> {
        const selectedBindingIds = normalizeBindingIds(bindingIds)
        if (!selectedBindingIds.length) {
            return []
        }
        this.assertRuntimeIdentityScope(scope)

        const result: SelectedRuntimeConnectorBinding[] = []
        for (const bindingId of selectedBindingIds) {
            const binding = await this.requireBinding(bindingId, scope.tenantId ?? undefined)
            await this.assertRuntimeBindingAccess(binding, scope)
            const connection =
                connectorAuthorizationMode(binding) === 'shared'
                    ? ({ binding, owner: binding, ownerKind: 'shared' } as const)
                    : await this.requirePersonalBindingConnection(binding, scope.userId)
            this.assertConnectionActive(connection)
            result.push({ bindingId: binding.id, provider: binding.provider })
        }
        return result
    }

    async getRuntimeConnector(input: ConnectorRuntimeGetInput): Promise<ConnectorRuntimeCredential> {
        const runtime = await this.getRuntimeConnectorCredential(input)
        return this.projectLegacyRuntimeResponse(runtime)
    }

    private projectLegacyRuntimeResponse(runtime: ConnectorRuntimeCredentialV2): ConnectorRuntimeCredential {
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
            bindingId: runtime.bindingId,
            scope: runtime.scope,
            authorizationMode: runtime.authorizationMode,
            workspaceId: runtime.workspaceId,
            projectId: runtime.projectId,
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
        if (input.bindingId) {
            throw new ForbiddenException(connectorAccessDeniedMessage())
        }
        const workspaceId = requiredConnectorText(input.workspaceId, 'workspaceId')
        const provider = requiredConnectorText(input.provider, 'provider')
        await this.workspaceAccessService.assertCanRun(workspaceId)
        const connector = await this.requireConnector({
            workspaceId,
            connectorId: input.connectorId,
            provider,
            authorizationMode: 'shared'
        })
        return this.resolveRuntimeCredential({ binding: connector, owner: connector, ownerKind: 'shared' })
    }

    async getRuntimeConnectorForScope(
        input: ConnectorRuntimeGetInput,
        scope: AgentMiddlewareRuntimeScope
    ): Promise<ConnectorRuntimeCredential> {
        return this.projectLegacyRuntimeResponse(await this.getRuntimeConnectorCredentialForScope(input, scope))
    }

    async getRuntimeConnectorCredentialForScope(
        input: ConnectorRuntimeGetInput,
        scope: AgentMiddlewareRuntimeScope
    ): Promise<ConnectorRuntimeCredentialV2> {
        const bindingIds = normalizeBindingIds(scope.connectorBindingIds)
        const requestedBindingId = input.bindingId ?? input.connectorId
        if (!requestedBindingId || !bindingIds.includes(requestedBindingId)) {
            throw new ForbiddenException(connectorAccessDeniedMessage())
        }
        this.assertRuntimeIdentityScope(scope)
        const binding = await this.requireBinding(requestedBindingId, scope.tenantId ?? undefined)
        let connection: BindingConnection | null = null
        try {
            if (input.provider && input.provider !== binding.provider) {
                throw new ForbiddenException(connectorAccessDeniedMessage())
            }
            await this.assertRuntimeBindingAccess(binding, scope)
            connection =
                connectorAuthorizationMode(binding) === 'shared'
                    ? { binding, owner: binding, ownerKind: 'shared' }
                    : await this.requirePersonalBindingConnection(binding, scope.userId)
            const resolved = await this.resolveRuntimeCredential(connection)
            await this.recordRuntimeAudit(binding, runtimeAccountId(connection), scope, 'resolved')
            return resolved
        } catch (error) {
            await this.recordRuntimeAudit(
                binding,
                connection ? runtimeAccountId(connection) : null,
                scope,
                'denied',
                connectorRuntimeErrorCode(error)
            )
            throw error
        }
    }

    private async resolveRuntimeCredential(connection: BindingConnection): Promise<ConnectorRuntimeCredentialV2> {
        const { binding, owner } = connection
        this.assertConnectionActive(connection)

        const credentialCiphertext = owner.credentialCiphertext
        const strategy = this.connectorStrategyRegistry.getRuntime(binding.provider, binding.organizationId)
        let stored = this.decryptCredential(owner, strategy.definition)
        if (isExpired(owner.expiresAt)) {
            if (isExpired(owner.refreshExpiresAt)) {
                await this.expireRuntimeCredential(
                    connection,
                    credentialCiphertext,
                    connectorRefreshTokenExpiredMessage()
                )
            }
            stored = await this.refreshCredential(connection, strategy, stored, credentialCiphertext)
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
            connectorId: binding.id,
            bindingId: binding.id,
            scope: bindingScope(binding),
            authorizationMode: connectorAuthorizationMode(binding),
            workspaceId: binding.workspaceId ?? null,
            projectId: binding.projectId ?? null,
            provider: binding.provider,
            authMethodId: stored.authMethodId,
            credentials: runtimeCredentials,
            expiresAt: owner.expiresAt?.toISOString() ?? stored.credential.expiresAt ?? null,
            scopes: owner.scopes ?? stored.credential.scopes,
            profile: owner.profile ?? stored.credential.profile ?? null
        }
    }

    private async refreshCredential(
        connection: BindingConnection,
        strategy: ConnectorStrategyRuntime,
        stored: StoredConnectorCredential,
        expectedCiphertext: string
    ) {
        const { owner } = connection
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
                        connection,
                        expectedCiphertext,
                        connectorCredentialRefreshUnavailableMessage()
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
            const message =
                error instanceof Error
                    ? error.message
                    : t('server-ai:Error.ConnectorUnknownError', { defaultValue: 'Unknown error' }) || 'Unknown error'
            await this.expireRuntimeCredential(
                connection,
                expectedCiphertext,
                connectorCredentialRefreshFailedMessage(message)
            )
        }

        const next: StoredConnectorCredential = {
            version: 1,
            authMethodId: stored.authMethodId,
            credential: parseConnectorCredential(refreshed)
        }
        const update: CredentialOwnerUpdate = {
            credentialCiphertext: encryptSecret(JSON.stringify(next), this.encryptionKey),
            expiresAt: parseOptionalDate(next.credential.expiresAt),
            refreshExpiresAt: parseOptionalDate(next.credential.refreshExpiresAt),
            scopes: next.credential.scopes ?? owner.scopes,
            profile: next.credential.profile ?? owner.profile,
            status: 'active',
            lastError: null
        }
        const result = await this.updateCredentialOwner(
            connection.ownerKind,
            {
                id: owner.id,
                status: 'active',
                credentialCiphertext: expectedCiphertext
            },
            update
        )
        if (result.affected !== 1) {
            throw connectorCredentialChangedError()
        }
        Object.assign(owner, update)
        return next
    }

    private async expireRuntimeCredential(
        connection: BindingConnection,
        expectedCiphertext: string,
        message: string
    ): Promise<never> {
        const result = await this.updateCredentialOwner(
            connection.ownerKind,
            {
                id: connection.owner.id,
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

    private async requireConnector(input: {
        workspaceId: string
        connectorId?: string
        provider?: string
        authorizationMode?: ConnectorAuthorizationMode
    }) {
        const tenantId = RequestContext.currentTenantId()
        const connector = await this.connectorRepository.findOne({
            where: {
                tenantId,
                workspaceId: input.workspaceId,
                ...(input.connectorId ? { id: input.connectorId } : {}),
                ...(input.provider ? { provider: input.provider } : {})
            }
        })

        if (
            !connector ||
            connectorScopeType(connector) !== 'workspace' ||
            (input.authorizationMode && connectorAuthorizationMode(connector) !== input.authorizationMode)
        ) {
            throw new NotFoundException(
                t('server-ai:Error.ConnectorNotFound', { defaultValue: 'Connector was not found' })
            )
        }

        return connector
    }

    private async requireBinding(connectorId: string, tenantId = RequestContext.currentTenantId()) {
        const binding = await this.connectorRepository.findOne({
            where: {
                id: requiredConnectorText(connectorId, 'connectorId'),
                tenantId
            }
        })
        if (!binding) {
            throw new NotFoundException(
                t('server-ai:Error.ConnectorBindingNotFound', {
                    defaultValue: 'Connector binding was not found'
                })
            )
        }
        binding.scopeType = connectorScopeType(binding)
        binding.authorizationMode = connectorAuthorizationMode(binding)
        return binding
    }

    private findBindings(scope: ConnectorScope) {
        return this.connectorRepository.find({
            where: {
                tenantId: RequestContext.currentTenantId(),
                ...scopeWhere(scope)
            }
        })
    }

    private async assertScopeRead(scope: ConnectorScope) {
        if (scope.type === 'workspace') {
            const access = await this.workspaceAccessService.assertCanRead(scope.workspaceId)
            return { organizationId: access.workspace.organizationId }
        }
        const access = await this.projectAccessService().assertCanUse(scope.projectId)
        return { organizationId: access.project.organizationId }
    }

    private async assertScopeManage(scope: ConnectorScope) {
        if (scope.type === 'workspace') {
            const access = await this.workspaceAccessService.assertCanManage(scope.workspaceId)
            return { organizationId: access.workspace.organizationId }
        }
        const access = await this.projectAccessService().assertCanManage(scope.projectId)
        return { organizationId: access.project.organizationId }
    }

    private assertBindingManage(binding: Connector) {
        return this.assertScopeManage(bindingScope(binding))
    }

    private async assertBindingUse(binding: Connector, xpertId?: string) {
        const scope = bindingScope(binding)
        const xpert = xpertId ? await this.assertBindingXpert(binding, xpertId) : null
        if (scope.type === 'project') {
            await this.projectAccessService().assertCanUse(scope.projectId)
            return
        }
        if (await this.isCurrentWorkspaceMember(scope.workspaceId, RequestContext.currentUserId())) {
            return
        }
        if (!xpert) {
            requiredConnectorText(xpertId, 'xpertId')
        }
    }

    private async assertBindingXpert(binding: Connector, xpertId: string) {
        const normalizedXpertId = requiredConnectorText(xpertId, 'xpertId')
        const xpert = await this.assertXpertRunAccess(normalizedXpertId)
        const scope = bindingScope(binding)
        if (scope.type === 'project') {
            await this.assertProjectUseXpert(scope.projectId, normalizedXpertId)
            return xpert
        }
        if (xpert.workspaceId !== scope.workspaceId) {
            throw new ForbiddenException(connectorAccessDeniedMessage())
        }
        return xpert
    }

    private async assertRuntimeBindingAccess(binding: Connector, scope: AgentMiddlewareRuntimeScope) {
        const tenantId = requiredConnectorText(scope.tenantId, 'runtime.tenantId')
        const userId = requiredConnectorText(scope.userId, 'runtime.userId')
        const xpertId = requiredConnectorText(scope.xpertId, 'runtime.xpertId')
        if (
            binding.tenantId !== tenantId ||
            tenantId !== RequestContext.currentTenantId() ||
            userId !== RequestContext.currentUserId()
        ) {
            throw new ForbiddenException(connectorAccessDeniedMessage())
        }
        const organizationId = scope.organizationId ?? null
        if (
            (binding.organizationId ?? null) !== organizationId ||
            (RequestContext.getOrganizationId() ?? null) !== organizationId
        ) {
            throw new ForbiddenException(connectorAccessDeniedMessage())
        }

        const xpert = await this.assertXpertRunAccess(xpertId)
        const bindingRuntimeScope = bindingScope(binding)
        if (bindingRuntimeScope.type === 'project') {
            if (scope.projectId !== bindingRuntimeScope.projectId) {
                throw new ForbiddenException(connectorAccessDeniedMessage())
            }
            await this.assertProjectUseXpert(bindingRuntimeScope.projectId, xpertId)
            return
        }
        if (scope.projectId || bindingRuntimeScope.workspaceId !== xpert.workspaceId) {
            throw new ForbiddenException(connectorAccessDeniedMessage())
        }
        if (
            connectorAuthorizationMode(binding) === 'shared' &&
            !(await this.isCurrentWorkspaceMember(bindingRuntimeScope.workspaceId, userId))
        ) {
            throw new ForbiddenException(connectorAccessDeniedMessage())
        }
    }

    private assertRuntimeIdentityScope(scope: AgentMiddlewareRuntimeScope) {
        requiredConnectorText(scope.tenantId, 'runtime.tenantId')
        requiredConnectorText(scope.userId, 'runtime.userId')
        requiredConnectorText(scope.xpertId, 'runtime.xpertId')
        requiredConnectorText(scope.conversationId, 'runtime.conversationId')
        requiredConnectorText(scope.executionId, 'runtime.executionId')
    }

    private assertConnectionActive(connection: BindingConnection) {
        if (connection.owner.status !== 'active' || !connection.owner.credentialCiphertext) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorNotActive', {
                    provider: connection.binding.provider,
                    defaultValue: `Connector '${connection.binding.provider}' is not active`
                })
            )
        }
    }

    private async isCurrentWorkspaceMember(workspaceId: string, userId?: string | null) {
        if (!userId) {
            return false
        }
        try {
            const access = await this.workspaceAccessService.assertCanRead(workspaceId, { relations: ['members'] })
            return (
                access.workspace.ownerId === userId ||
                access.workspace.members?.some((member) => member.id === userId) === true
            )
        } catch {
            return false
        }
    }

    private assertXpertRunAccess(xpertId: string) {
        return this.publishedXpertAccessService().getAccessiblePublishedXpert(xpertId, {
            relations: ['workspace']
        })
    }

    private assertProjectUseXpert(projectId: string, xpertId: string) {
        return this.projectAccessService().assertCanUseXpert(projectId, xpertId)
    }

    private publishedXpertAccessService() {
        const service = this.moduleRef?.get(PublishedXpertAccessService, { strict: false })
        if (!service) {
            throw new ForbiddenException(connectorAccessDeniedMessage())
        }
        return service
    }

    private projectAccessService() {
        const service = this.moduleRef?.get(XpertProjectAccessService, { strict: false })
        if (!service) {
            throw new ForbiddenException(connectorAccessDeniedMessage())
        }
        return service
    }

    private requirePersonalAccountRepository() {
        if (!this.personalAccountRepository) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorPersonalAccountsUnavailable', {
                    defaultValue: 'Personal connector accounts are not available'
                })
            )
        }
        return this.personalAccountRepository
    }

    private requirePersonalGrantRepository() {
        if (!this.personalGrantRepository) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorPersonalGrantsUnavailable', {
                    defaultValue: 'Personal connector grants are not available'
                })
            )
        }
        return this.personalGrantRepository
    }

    private findPersonalAccount(provider: string, userId?: string | null) {
        if (!userId) {
            return Promise.resolve(null)
        }
        return this.requirePersonalAccountRepository().findOne({
            where: {
                tenantId: RequestContext.currentTenantId(),
                userId,
                provider
            }
        })
    }

    private async requireOrCreatePersonalAccount(provider: string, userId?: string | null) {
        const normalizedUserId = requiredConnectorText(userId, 'userId')
        const existing = await this.findPersonalAccount(provider, normalizedUserId)
        if (existing) {
            return existing
        }
        const repository = this.requirePersonalAccountRepository()
        return repository.save(
            repository.create({
                tenantId: RequestContext.currentTenantId(),
                userId: normalizedUserId,
                provider,
                status: 'disconnected',
                authMethodId: null,
                connectionAttemptId: null,
                profile: null,
                scopes: null,
                credentialCiphertext: null,
                expiresAt: null,
                refreshExpiresAt: null,
                connectedAt: null,
                disconnectedAt: null,
                lastError: null,
                createdById: normalizedUserId,
                updatedById: normalizedUserId
            })
        )
    }

    private async findPersonalBindingConnection(binding: Connector, userId: string): Promise<BindingConnection | null> {
        const grant = await this.requirePersonalGrantRepository().findOne({
            where: {
                tenantId: binding.tenantId,
                connectorId: binding.id,
                userId
            }
        })
        if (!grant) {
            return null
        }
        const account = await this.requirePersonalAccountRepository().findOne({
            where: {
                id: grant.accountId,
                tenantId: binding.tenantId,
                userId,
                provider: binding.provider
            }
        })
        return account ? { binding, owner: account, ownerKind: 'personal' } : null
    }

    private async requirePersonalBindingConnection(binding: Connector, userId?: string | null) {
        const normalizedUserId = requiredConnectorText(userId, 'runtime.userId')
        const connection = await this.findPersonalBindingConnection(binding, normalizedUserId)
        if (!connection) {
            throw new ForbiddenException(connectorAccessDeniedMessage())
        }
        return connection
    }

    private async ensurePersonalGrant(connection: BindingConnection, owner: CredentialOwner) {
        if (connection.ownerKind !== 'personal') {
            return
        }
        const accountId = requiredConnectorText(owner.id, 'personalAccountId')
        const userId = personalAccountUserId(owner)
        const repository = this.requirePersonalGrantRepository()
        const existing = await repository.findOne({
            where: {
                tenantId: connection.binding.tenantId,
                connectorId: connection.binding.id,
                userId
            }
        })
        await repository.save(
            repository.create({
                ...(existing ?? {}),
                tenantId: connection.binding.tenantId,
                organizationId: connection.binding.organizationId,
                connectorId: connection.binding.id,
                accountId,
                userId,
                grantedAt: new Date(),
                createdById: existing?.createdById ?? userId,
                updatedById: userId
            })
        )
    }

    private async resolveSessionConnection(
        session: ConnectorOAuthSession,
        binding: Connector
    ): Promise<BindingConnection> {
        if (sessionAuthorizationMode(session) === 'shared') {
            return { binding, owner: binding, ownerKind: 'shared' }
        }
        const repository = this.requirePersonalAccountRepository()
        const account = await repository.findOne({
            where: {
                id: requiredConnectorText(session.personalAccountId, 'personalAccountId'),
                tenantId: session.tenantId,
                userId: requiredConnectorText(session.actorUserId, 'actorUserId'),
                provider: session.provider
            }
        })
        if (!account) {
            throw new BadRequestException(connectorOAuthSessionExpiredMessage())
        }
        return { binding, owner: account, ownerKind: 'personal' }
    }

    private saveCredentialOwner(kind: CredentialOwnerKind, owner: CredentialOwner) {
        if (kind === 'personal') {
            if (!isPersonalCredentialOwner(owner)) {
                throw new BadRequestException(
                    t('server-ai:Error.ConnectorPersonalCredentialOwnerInvalid', {
                        defaultValue: 'Personal connector credential owner is invalid'
                    })
                )
            }
            return this.requirePersonalAccountRepository().save(owner)
        }
        if (isPersonalCredentialOwner(owner)) {
            throw new BadRequestException(
                t('server-ai:Error.ConnectorSharedCredentialOwnerInvalid', {
                    defaultValue: 'Shared connector credential owner is invalid'
                })
            )
        }
        return this.connectorRepository.save(owner)
    }

    private updateCredentialOwner(
        kind: CredentialOwnerKind,
        criteria: FindOptionsWhere<Connector> | FindOptionsWhere<ConnectorPersonalAccount>,
        input: CredentialOwnerUpdate
    ) {
        if (kind === 'personal') {
            return this.requirePersonalAccountRepository().update(criteria, input)
        }
        return this.connectorRepository.update(criteria, input)
    }

    private async recordRuntimeAudit(
        binding: Connector,
        accountId: string | null,
        scope: AgentMiddlewareRuntimeScope,
        outcome: ConnectorRuntimeAudit['outcome'],
        errorCode?: string
    ) {
        if (!this.runtimeAuditRepository) {
            return
        }
        await this.runtimeAuditRepository.save(
            this.runtimeAuditRepository.create({
                tenantId: binding.tenantId,
                organizationId: binding.organizationId,
                connectorId: binding.id,
                accountId,
                provider: binding.provider,
                scopeType: connectorScopeType(binding),
                authorizationMode: connectorAuthorizationMode(binding),
                workspaceId: binding.workspaceId ?? null,
                projectId: binding.projectId ?? null,
                actorUserId: scope.userId ?? null,
                xpertId: scope.xpertId ?? null,
                conversationId: scope.conversationId ?? null,
                executionId: scope.executionId ?? null,
                outcome,
                errorCode: errorCode ?? null,
                createdById: scope.userId ?? null,
                updatedById: scope.userId ?? null
            })
        )
    }

    private decryptCredential(
        connector: CredentialOwner,
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

    private toPublicConnector(connector: Connector, credentialOwner?: CredentialOwner): ConnectorInstance {
        const authorizationMode = connectorAuthorizationMode(connector)
        const owner =
            authorizationMode === 'personal'
                ? credentialOwner && isPersonalCredentialOwner(credentialOwner)
                    ? credentialOwner
                    : null
                : connector
        return {
            id: connector.id,
            scopeType: connectorScopeType(connector),
            scope: bindingScope(connector),
            authorizationMode,
            workspaceId: connector.workspaceId ?? null,
            projectId: connector.projectId ?? null,
            provider: connector.provider,
            authMethodId: owner?.authMethodId ?? null,
            status: owner?.status ?? 'disconnected',
            profile: owner?.profile ?? null,
            scopes: owner?.scopes ?? undefined,
            expiresAt: owner?.expiresAt?.toISOString() ?? null,
            refreshExpiresAt: owner?.refreshExpiresAt?.toISOString() ?? null,
            connectedAt: owner?.connectedAt?.toISOString() ?? null,
            disconnectedAt: owner?.disconnectedAt?.toISOString() ?? null,
            lastError: owner?.lastError ?? null,
            createdById: connector.createdById ?? null,
            updatedById: connector.updatedById ?? null,
            createdAt: connector.createdAt?.toISOString(),
            updatedAt: connector.updatedAt?.toISOString()
        }
    }

    private toPublicBinding(connector: Connector, credentialOwner?: CredentialOwner): ConnectorBinding {
        const result = this.toPublicConnector(connector, credentialOwner)
        return {
            ...result,
            scopeType: connectorScopeType(connector),
            scope: bindingScope(connector),
            authorizationMode: connectorAuthorizationMode(connector)
        }
    }

    private toPublicPersonalAccount(account: ConnectorPersonalAccount): ConnectorPersonalAccountInstance {
        return {
            id: account.id,
            provider: account.provider,
            status: account.status,
            authMethodId: account.authMethodId ?? null,
            profile: account.profile ?? null,
            scopes: account.scopes ?? undefined,
            expiresAt: account.expiresAt?.toISOString() ?? null,
            connectedAt: account.connectedAt?.toISOString() ?? null,
            disconnectedAt: account.disconnectedAt?.toISOString() ?? null,
            lastError: account.lastError ?? null
        }
    }
}

function createState() {
    return randomBytes(32).toString('base64url')
}

function normalizeConnectorScope(scope: ConnectorScope): ConnectorScope {
    if (scope?.type === 'workspace') {
        return { type: 'workspace', workspaceId: requiredConnectorText(scope.workspaceId, 'workspaceId') }
    }
    if (scope?.type === 'project') {
        return { type: 'project', projectId: requiredConnectorText(scope.projectId, 'projectId') }
    }
    throw new BadRequestException(
        t('server-ai:Error.ConnectorScopeInvalid', { defaultValue: 'Connector scope is invalid' })
    )
}

function scopeWhere(scope: ConnectorScope) {
    return scope.type === 'workspace'
        ? { scopeType: 'workspace' as const, workspaceId: scope.workspaceId, projectId: null }
        : { scopeType: 'project' as const, workspaceId: null, projectId: scope.projectId }
}

function connectorScopeType(connector: Connector) {
    return connector.scopeType === 'project' ? 'project' : 'workspace'
}

function connectorAuthorizationMode(connector: Connector): ConnectorAuthorizationMode {
    return connector.authorizationMode === 'personal' ? 'personal' : 'shared'
}

function sessionAuthorizationMode(session: ConnectorOAuthSession): ConnectorAuthorizationMode {
    return session.authorizationMode === 'personal' ? 'personal' : 'shared'
}

function bindingScope(binding: Connector): ConnectorScope {
    if (connectorScopeType(binding) === 'project') {
        return { type: 'project', projectId: requiredConnectorText(binding.projectId, 'projectId') }
    }
    return { type: 'workspace', workspaceId: requiredConnectorText(binding.workspaceId, 'workspaceId') }
}

function sessionScope(session: ConnectorOAuthSession): ConnectorScope {
    if (session.scopeType === 'project') {
        return { type: 'project', projectId: requiredConnectorText(session.projectId, 'projectId') }
    }
    return { type: 'workspace', workspaceId: requiredConnectorText(session.workspaceId, 'workspaceId') }
}

function parseAuthorizationMode(value: unknown): ConnectorAuthorizationMode {
    if (value === 'personal' || value === 'shared') {
        return value
    }
    throw new BadRequestException(
        t('server-ai:Error.ConnectorAuthorizationModeInvalid', {
            defaultValue: 'Connector authorization mode is invalid'
        })
    )
}

function assertAuthorizationModeSupported(
    definition: ConnectorStrategyDefinition,
    authorizationMode: ConnectorAuthorizationMode
) {
    if (!getConnectorAuthorizationModes(definition).includes(authorizationMode)) {
        throw new BadRequestException(
            t('server-ai:Error.ConnectorAuthorizationModeUnsupported', {
                provider: definition.provider,
                mode: authorizationMode,
                defaultValue: `Connector '${definition.provider}' does not support '${authorizationMode}' authorization`
            })
        )
    }
}

function assertSessionBinding(session: ConnectorOAuthSession, binding: Connector) {
    const sessionConnectorScope = sessionScope(session)
    const connectorScope = bindingScope(binding)
    const sameScope =
        sessionConnectorScope.type === connectorScope.type &&
        (sessionConnectorScope.type === 'workspace'
            ? sessionConnectorScope.workspaceId ===
              (connectorScope.type === 'workspace' ? connectorScope.workspaceId : undefined)
            : sessionConnectorScope.projectId ===
              (connectorScope.type === 'project' ? connectorScope.projectId : undefined))
    if (
        !sameScope ||
        session.tenantId !== binding.tenantId ||
        (session.organizationId ?? null) !== (binding.organizationId ?? null) ||
        sessionAuthorizationMode(session) !== connectorAuthorizationMode(binding) ||
        session.provider !== binding.provider
    ) {
        throw new BadRequestException(connectorOAuthSessionExpiredMessage())
    }
}

function disconnectedCredentialState(): CredentialOwnerUpdate {
    return {
        status: 'disconnected',
        connectionAttemptId: null,
        credentialCiphertext: null,
        profile: null,
        scopes: null,
        expiresAt: null,
        refreshExpiresAt: null,
        disconnectedAt: new Date(),
        lastError: null
    }
}

function isPersonalCredentialOwner(owner: CredentialOwner): owner is ConnectorPersonalAccount {
    return 'userId' in owner && typeof owner.userId === 'string'
}

function personalAccountUserId(owner: CredentialOwner) {
    if (!isPersonalCredentialOwner(owner)) {
        throw new BadRequestException(
            t('server-ai:Error.ConnectorPersonalCredentialOwnerInvalid', {
                defaultValue: 'Personal connector credential owner is invalid'
            })
        )
    }
    return requiredConnectorText(owner.userId, 'personalAccount.userId')
}

function isBindingConnection(value: Connector | BindingConnection): value is BindingConnection {
    return 'binding' in value && 'owner' in value && 'ownerKind' in value
}

function runtimeAccountId(connection: BindingConnection) {
    return connection.ownerKind === 'personal' ? requiredConnectorText(connection.owner.id, 'personalAccountId') : null
}

function normalizeBindingIds(value?: string[] | null) {
    return Array.from(
        new Set((value ?? []).map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean))
    )
}

function requiredConnectorText(value: unknown, field: string) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new BadRequestException(
            t('server-ai:Error.ConnectorFieldRequired', {
                field,
                defaultValue: `Connector ${field} is required`
            })
        )
    }
    return value.trim()
}

function optionalConnectorText(value: unknown, field: string) {
    return value == null ? null : requiredConnectorText(value, field)
}

function connectorRuntimeErrorCode(error: unknown) {
    if (error instanceof ForbiddenException) {
        return 'access_denied'
    }
    if (error instanceof NotFoundException) {
        return 'not_found'
    }
    return 'credential_unavailable'
}

function connectorAccessDeniedMessage() {
    return t('server-ai:Error.ConnectorAccessDenied', {
        defaultValue: 'Connector access is not available in the current scope'
    })
}

function connectorOAuthSessionExpiredMessage() {
    const defaultValue = 'Connector OAuth session has expired'
    return t('server-ai:Error.ConnectorOAuthSessionExpired', { defaultValue }) || defaultValue
}

function connectorRefreshTokenExpiredMessage() {
    const defaultValue = 'Connector refresh token has expired'
    return t('server-ai:Error.ConnectorRefreshTokenExpired', { defaultValue }) || defaultValue
}

function connectorCredentialRefreshUnavailableMessage() {
    const defaultValue = 'Connector credential expired and cannot be refreshed'
    return t('server-ai:Error.ConnectorCredentialRefreshUnavailable', { defaultValue }) || defaultValue
}

function connectorCredentialRefreshFailedMessage(message: string) {
    const defaultValue = `Connector credential refresh failed: ${message}`
    return t('server-ai:Error.ConnectorCredentialRefreshFailed', { message, defaultValue }) || defaultValue
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

function resolveStoredAuthMethodId(connector: CredentialOwner, definition: ConnectorStrategyDefinition) {
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
    connector: CredentialOwner,
    definition: ConnectorStrategyDefinition
) {
    const authMethodId = metadata.authMethodId
        ? resolveAuthMethod(definition, metadata.authMethodId).id
        : resolveStoredAuthMethodId(connector, definition)
    if (connector.authMethodId && connector.authMethodId !== authMethodId) {
        throw new BadRequestException(connectorOAuthSessionExpiredMessage())
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
        throw new BadRequestException(
            t('server-ai:Error.ConnectorStoredCredentialInvalid', {
                defaultValue: 'Stored connector credential is invalid'
            })
        )
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
        throw new BadRequestException(
            t('server-ai:Error.ConnectorStoredCredentialRequiredFieldsMissing', {
                defaultValue: 'Stored connector credential is missing required fields'
            })
        )
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
        authorizationModes: getConnectorAuthorizationModes(definition),
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

function hasCredentialPayload(input: unknown) {
    return isRecord(input) && Reflect.get(input, 'credential') != null
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
