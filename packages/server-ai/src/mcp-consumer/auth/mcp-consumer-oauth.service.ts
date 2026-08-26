import type { IXpertToolset, TMCPServer, TMcpConsumerAuth } from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import { decryptSecret, encryptSecret, RequestContext } from '@xpert-ai/server-core'
import { auth, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import type {
    OAuthClientInformation,
    OAuthClientInformationFull,
    OAuthClientMetadata,
    OAuthTokens
} from '@modelcontextprotocol/sdk/shared/auth.js'
import { OAuthClientInformationSchema, OAuthTokensSchema } from '@modelcontextprotocol/sdk/shared/auth.js'
import { BadRequestException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomBytes } from 'node:crypto'
import { Repository } from 'typeorm'
import { XpertWorkspaceAccessService } from '../../xpert-workspace'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { configureMcpConsumerAuthProviderResolver, McpConsumerAuthProviderRequest } from './mcp-consumer-auth.registry'
import { McpConsumerOAuthCredential } from './mcp-consumer-oauth-credential.entity'
import { McpConsumerOAuthSession } from './mcp-consumer-oauth-session.entity'

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const OAUTH_EXPIRY_SKEW_MS = 30 * 1000

type StoredOAuthCredential = {
    version: 1
    clientInformation?: OAuthClientInformation
    tokens?: OAuthTokens
}

type OAuthSubject = {
    type: 'user' | 'organization'
    id: string
}

export type McpConsumerOAuthStatus = {
    status: 'disconnected' | 'pending' | 'connected' | 'expired' | 'error'
    authorizationUrl?: string | null
    expiresAt?: string | null
    scopes?: string[]
    message?: string | null
}

@Injectable()
export class McpConsumerOAuthService implements OnModuleInit, OnModuleDestroy {
    private readonly encryptionKey = environment.secretsEncryptionKey

    constructor(
        @InjectRepository(McpConsumerOAuthCredential)
        private readonly credentialRepository: Repository<McpConsumerOAuthCredential>,
        @InjectRepository(McpConsumerOAuthSession)
        private readonly sessionRepository: Repository<McpConsumerOAuthSession>,
        @InjectRepository(XpertToolset)
        private readonly toolsetRepository: Repository<XpertToolset>,
        private readonly workspaceAccess: XpertWorkspaceAccessService
    ) {}

    onModuleInit() {
        configureMcpConsumerAuthProviderResolver((request) => this.resolveRuntimeProvider(request))
    }

    onModuleDestroy() {
        configureMcpConsumerAuthProviderResolver(null)
    }

    async begin(input: {
        workspaceId: string
        toolsetId: string
        serverName: string
        redirectUri: string
    }): Promise<McpConsumerOAuthStatus> {
        await this.workspaceAccess.assertCanManage(input.workspaceId)
        const { toolset, server, authConfig } = await this.requireOAuthServer(input)
        const userId = RequestContext.currentUserId()
        if (!userId) throw new BadRequestException('MCP OAuth requires an authenticated user')
        const subject = resolveSubject(authConfig, userId, toolset.organizationId)
        const current = await this.findCredential(toolset.id, input.serverName, subject)
        if (hasUsableTokens(current)) return toStatus(current)

        const state = randomBytes(32).toString('base64url')
        const session = await this.sessionRepository.save(
            this.sessionRepository.create({
                tenantId: toolset.tenantId,
                organizationId: toolset.organizationId ?? null,
                workspaceId: input.workspaceId,
                toolsetId: toolset.id,
                serverName: input.serverName,
                subjectType: subject.type,
                subjectId: subject.id,
                userId,
                serverUrl: requireHttpUrl(server.url),
                redirectUri: requireHttpUrl(input.redirectUri),
                scopes: authConfig.scopes ?? null,
                stateHash: hashState(state),
                expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS)
            })
        )
        const provider = new PersistentOAuthProvider(this, {
            state,
            session,
            subject,
            redirectUri: session.redirectUri,
            scopes: authConfig.scopes
        })
        const result = await auth(provider, {
            serverUrl: session.serverUrl,
            scope: authConfig.scopes?.join(' ')
        })
        if (result === 'AUTHORIZED') {
            await this.consumeSession(session)
            return this.status(input)
        }
        return {
            status: 'pending',
            authorizationUrl: provider.authorizationUrl,
            expiresAt: session.expiresAt.toISOString(),
            scopes: authConfig.scopes
        }
    }

    async complete(input: { state: string; code: string }) {
        if (!input.state || !input.code) throw new BadRequestException('MCP OAuth callback is incomplete')
        const session = await this.findSession(input.state)
        if (!session || session.consumedAt || session.expiresAt.getTime() < Date.now()) {
            throw new BadRequestException('Invalid or expired MCP OAuth state')
        }
        const provider = new PersistentOAuthProvider(this, {
            state: input.state,
            session,
            subject: { type: session.subjectType, id: session.subjectId },
            redirectUri: session.redirectUri,
            scopes: session.scopes ?? undefined
        })
        const result = await auth(provider, {
            serverUrl: session.serverUrl,
            authorizationCode: input.code,
            scope: session.scopes?.join(' ')
        })
        if (result !== 'AUTHORIZED') throw new BadRequestException('MCP OAuth authorization was not completed')
        await this.consumeSession(session)
        return { workspaceId: session.workspaceId, toolsetId: session.toolsetId }
    }

    async callbackContext(state: string) {
        const session = state ? await this.findSession(state) : null
        return session ? { workspaceId: session.workspaceId, toolsetId: session.toolsetId } : null
    }

    async status(input: {
        workspaceId: string
        toolsetId: string
        serverName: string
    }): Promise<McpConsumerOAuthStatus> {
        await this.workspaceAccess.assertCanRead(input.workspaceId)
        const { toolset, authConfig } = await this.requireOAuthServer(input)
        const userId = RequestContext.currentUserId()
        if (!userId) return { status: 'disconnected' }
        const subject = resolveSubject(authConfig, userId, toolset.organizationId)
        const credential = await this.findCredential(toolset.id, input.serverName, subject)
        if (credential) return toStatus(credential)
        const session = await this.findLatestSession(toolset.id, input.serverName, subject)
        if (session && !session.consumedAt && session.expiresAt.getTime() >= Date.now()) {
            return {
                status: 'pending',
                authorizationUrl: session.authorizationUrl,
                expiresAt: session.expiresAt.toISOString(),
                scopes: session.scopes ?? undefined
            }
        }
        return { status: 'disconnected' }
    }

    async disconnect(input: { workspaceId: string; toolsetId: string; serverName: string }) {
        await this.workspaceAccess.assertCanManage(input.workspaceId)
        const { toolset, authConfig } = await this.requireOAuthServer(input)
        const userId = RequestContext.currentUserId()
        if (!userId) throw new BadRequestException('MCP OAuth requires an authenticated user')
        const subject = resolveSubject(authConfig, userId, toolset.organizationId)
        await this.credentialRepository.delete({
            toolsetId: toolset.id,
            serverName: input.serverName,
            subjectType: subject.type,
            subjectId: subject.id
        })
        const sessions = await this.sessionRepository.find({
            where: {
                toolsetId: toolset.id,
                serverName: input.serverName,
                subjectType: subject.type,
                subjectId: subject.id
            }
        })
        await Promise.all(
            sessions.filter((session) => !session.consumedAt).map((session) => this.consumeSession(session))
        )
        return { status: 'disconnected' as const }
    }

    async clientInformation(toolsetId: string, serverName: string, subject: OAuthSubject) {
        return (await this.readStoredCredential(toolsetId, serverName, subject))?.payload.clientInformation
    }

    async tokens(toolsetId: string, serverName: string, subject: OAuthSubject) {
        return (await this.readStoredCredential(toolsetId, serverName, subject))?.payload.tokens
    }

    async saveClientInformation(input: {
        session: McpConsumerOAuthSession
        subject: OAuthSubject
        clientInformation: OAuthClientInformationFull
    }) {
        const stored = await this.readStoredCredential(input.session.toolsetId, input.session.serverName, input.subject)
        await this.saveCredential(input.session, input.subject, {
            version: 1,
            clientInformation: input.clientInformation,
            tokens: stored?.payload.tokens
        })
    }

    async saveTokens(input: { session: McpConsumerOAuthSession; subject: OAuthSubject; tokens: OAuthTokens }) {
        const stored = await this.readStoredCredential(input.session.toolsetId, input.session.serverName, input.subject)
        await this.saveCredential(input.session, input.subject, {
            version: 1,
            clientInformation: stored?.payload.clientInformation,
            tokens: {
                ...input.tokens,
                ...(input.tokens.refresh_token || !stored?.payload.tokens?.refresh_token
                    ? {}
                    : { refresh_token: stored.payload.tokens.refresh_token })
            }
        })
    }

    async saveCodeVerifier(session: McpConsumerOAuthSession, codeVerifier: string) {
        session.codeVerifierCiphertext = encryptSecret(codeVerifier, this.encryptionKey)
        await this.sessionRepository.save(session)
    }

    async codeVerifier(session: McpConsumerOAuthSession) {
        const loaded = await this.sessionRepository
            .createQueryBuilder('session')
            .addSelect('session.codeVerifierCiphertext')
            .where('session.id = :id', { id: session.id })
            .getOne()
        if (!loaded?.codeVerifierCiphertext) throw new BadRequestException('MCP OAuth code verifier is missing')
        return decryptSecret(loaded.codeVerifierCiphertext, this.encryptionKey)
    }

    async saveAuthorizationUrl(session: McpConsumerOAuthSession, authorizationUrl: string) {
        session.authorizationUrl = authorizationUrl
        await this.sessionRepository.save(session)
    }

    private async resolveRuntimeProvider(request: McpConsumerAuthProviderRequest) {
        if (request.server.auth?.type !== 'oauth') return undefined
        if (!request.toolset.id || !request.server.url)
            throw new Error('Persisted MCP OAuth requires a saved HTTP toolset')
        const subject = resolveSubject(request.server.auth, request.userId, request.organizationId)
        const credential = await this.findCredential(request.toolset.id, request.serverName, subject)
        if (!credential) throw new McpConsumerOAuthAuthorizationRequiredError(request.toolset.id, request.serverName)
        const runtimeSession = runtimeSessionForCredential(credential, request.server.url)
        const provider = new PersistentOAuthProvider(this, {
            session: runtimeSession,
            subject,
            redirectUri: runtimeSession.redirectUri,
            scopes: request.server.auth.scopes
        })
        if (!hasUsableTokens(credential)) {
            const stored = await this.readStoredCredential(request.toolset.id, request.serverName, subject)
            if (!stored?.payload.tokens?.refresh_token) {
                throw new McpConsumerOAuthAuthorizationRequiredError(request.toolset.id, request.serverName)
            }
            const result = await auth(provider, {
                serverUrl: request.server.url,
                scope: request.server.auth.scopes?.join(' ')
            })
            if (result !== 'AUTHORIZED') {
                throw new McpConsumerOAuthAuthorizationRequiredError(request.toolset.id, request.serverName)
            }
        }
        return provider
    }

    private async requireOAuthServer(input: { workspaceId: string; toolsetId: string; serverName: string }) {
        const toolset = await this.toolsetRepository.findOne({
            where: {
                id: input.toolsetId,
                workspaceId: input.workspaceId,
                tenantId: RequestContext.currentTenantId()
            }
        })
        if (!toolset) throw new BadRequestException('MCP toolset was not found')
        const server = readMcpServer(toolset, input.serverName)
        if (server.auth?.type !== 'oauth') throw new BadRequestException('MCP server is not configured for OAuth')
        return { toolset, server, authConfig: server.auth }
    }

    private async findCredential(toolsetId: string, serverName: string, subject: OAuthSubject) {
        return this.credentialRepository.findOne({
            where: { toolsetId, serverName, subjectType: subject.type, subjectId: subject.id }
        })
    }

    private async readStoredCredential(toolsetId: string, serverName: string, subject: OAuthSubject) {
        const credential = await this.credentialRepository
            .createQueryBuilder('credential')
            .addSelect('credential.credentialCiphertext')
            .where('credential.toolsetId = :toolsetId', { toolsetId })
            .andWhere('credential.serverName = :serverName', { serverName })
            .andWhere('credential.subjectType = :subjectType', { subjectType: subject.type })
            .andWhere('credential.subjectId = :subjectId', { subjectId: subject.id })
            .getOne()
        if (!credential?.credentialCiphertext) return undefined
        return { credential, payload: parseStoredCredential(credential.credentialCiphertext, this.encryptionKey) }
    }

    private async saveCredential(
        session: McpConsumerOAuthSession,
        subject: OAuthSubject,
        payload: StoredOAuthCredential
    ) {
        let credential = await this.findCredential(session.toolsetId, session.serverName, subject)
        credential ??= this.credentialRepository.create({
            tenantId: session.tenantId,
            organizationId: session.organizationId ?? null,
            workspaceId: session.workspaceId,
            toolsetId: session.toolsetId,
            serverName: session.serverName,
            subjectType: subject.type,
            subjectId: subject.id
        })
        credential.credentialCiphertext = encryptSecret(JSON.stringify(payload), this.encryptionKey)
        credential.scopes = session.scopes ?? null
        credential.expiresAt = payload.tokens?.expires_in
            ? new Date(Date.now() + payload.tokens.expires_in * 1000)
            : null
        credential.connectedAt = payload.tokens ? new Date() : credential.connectedAt
        credential.lastError = null
        await this.credentialRepository.save(credential)
    }

    private findSession(state: string) {
        return this.sessionRepository.findOne({ where: { stateHash: hashState(state) } })
    }

    private findLatestSession(toolsetId: string, serverName: string, subject: OAuthSubject) {
        return this.sessionRepository.findOne({
            where: { toolsetId, serverName, subjectType: subject.type, subjectId: subject.id },
            order: { createdAt: 'DESC' }
        })
    }

    private async consumeSession(session: McpConsumerOAuthSession) {
        session.consumedAt = new Date()
        session.codeVerifierCiphertext = null
        await this.sessionRepository.save(session)
    }
}

class PersistentOAuthProvider implements OAuthClientProvider {
    authorizationUrl?: string

    constructor(
        private readonly service: McpConsumerOAuthService,
        private readonly context: {
            state?: string
            session: McpConsumerOAuthSession
            subject: OAuthSubject
            redirectUri: string
            scopes?: string[]
        }
    ) {}

    get redirectUrl() {
        return this.context.redirectUri
    }

    get clientMetadata(): OAuthClientMetadata {
        return {
            redirect_uris: [this.context.redirectUri],
            token_endpoint_auth_method: 'none',
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            client_name: 'Xpert MCP Consumer',
            scope: this.context.scopes?.join(' ')
        }
    }

    state() {
        return this.context.state ?? randomBytes(32).toString('base64url')
    }

    clientInformation() {
        return this.service.clientInformation(
            this.context.session.toolsetId,
            this.context.session.serverName,
            this.context.subject
        )
    }

    saveClientInformation(clientInformation: OAuthClientInformationFull) {
        return this.service.saveClientInformation({
            session: this.context.session,
            subject: this.context.subject,
            clientInformation
        })
    }

    tokens() {
        return this.service.tokens(
            this.context.session.toolsetId,
            this.context.session.serverName,
            this.context.subject
        )
    }

    saveTokens(tokens: OAuthTokens) {
        return this.service.saveTokens({
            session: this.context.session,
            subject: this.context.subject,
            tokens
        })
    }

    async redirectToAuthorization(authorizationUrl: URL) {
        this.authorizationUrl = authorizationUrl.toString()
        if (!this.context.state) {
            throw new McpConsumerOAuthAuthorizationRequiredError(
                this.context.session.toolsetId,
                this.context.session.serverName,
                this.authorizationUrl
            )
        }
        await this.service.saveAuthorizationUrl(this.context.session, this.authorizationUrl)
    }

    saveCodeVerifier(codeVerifier: string) {
        if (!this.context.state) {
            throw new McpConsumerOAuthAuthorizationRequiredError(
                this.context.session.toolsetId,
                this.context.session.serverName
            )
        }
        return this.service.saveCodeVerifier(this.context.session, codeVerifier)
    }

    codeVerifier() {
        return this.service.codeVerifier(this.context.session)
    }
}

export class McpConsumerOAuthAuthorizationRequiredError extends Error {
    constructor(
        readonly toolsetId: string,
        readonly serverName: string,
        readonly authorizationUrl?: string
    ) {
        super(`MCP OAuth authorization is required for '${serverName}'`)
    }
}

function readMcpServer(toolset: Pick<IXpertToolset, 'schema'>, serverName: string): TMCPServer {
    if (!toolset.schema) throw new BadRequestException('MCP toolset schema is empty')
    let schema: unknown
    try {
        schema = JSON.parse(toolset.schema)
    } catch {
        throw new BadRequestException('MCP toolset schema is invalid')
    }
    if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
        throw new BadRequestException('MCP toolset schema is invalid')
    }
    const servers = Reflect.get(schema, 'servers') ?? Reflect.get(schema, 'mcpServers')
    if (typeof servers !== 'object' || servers === null || Array.isArray(servers)) {
        throw new BadRequestException('MCP toolset does not define servers')
    }
    const server = Reflect.get(servers, serverName)
    if (typeof server !== 'object' || server === null || Array.isArray(server)) {
        throw new BadRequestException(`MCP server '${serverName}' was not found`)
    }
    return server as TMCPServer
}

function resolveSubject(
    authConfig: Extract<TMcpConsumerAuth, { type: 'oauth' }>,
    userId?: string,
    organizationId?: string | null
) {
    if (authConfig.binding === 'organization') {
        if (!organizationId) throw new BadRequestException('Organization-bound MCP OAuth requires an organization')
        return { type: 'organization' as const, id: organizationId }
    }
    if (!userId) throw new BadRequestException('User-bound MCP OAuth requires an authenticated user')
    return { type: 'user' as const, id: userId }
}

function requireHttpUrl(value?: string) {
    if (!value) throw new BadRequestException('MCP OAuth requires a server URL')
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new BadRequestException('MCP OAuth requires an HTTP or HTTPS URL')
    }
    if (url.username || url.password) throw new BadRequestException('MCP OAuth URLs cannot contain credentials')
    return url.toString()
}

function hashState(state: string) {
    return createHash('sha256').update(state).digest('hex')
}

function parseStoredCredential(ciphertext: string, encryptionKey: string): StoredOAuthCredential {
    const parsed: unknown = JSON.parse(decryptSecret(ciphertext, encryptionKey))
    if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed) ||
        Reflect.get(parsed, 'version') !== 1
    ) {
        throw new Error('Stored MCP OAuth credential is invalid')
    }
    const client = Reflect.get(parsed, 'clientInformation')
    const tokens = Reflect.get(parsed, 'tokens')
    return {
        version: 1,
        ...(client === undefined ? {} : { clientInformation: OAuthClientInformationSchema.parse(client) }),
        ...(tokens === undefined ? {} : { tokens: OAuthTokensSchema.parse(tokens) })
    }
}

function hasUsableTokens(credential?: McpConsumerOAuthCredential | null) {
    return (
        !!credential?.connectedAt &&
        (!credential.expiresAt || credential.expiresAt.getTime() > Date.now() + OAUTH_EXPIRY_SKEW_MS)
    )
}

function toStatus(credential: McpConsumerOAuthCredential): McpConsumerOAuthStatus {
    if (credential.lastError) {
        return { status: 'error', message: credential.lastError, scopes: credential.scopes ?? undefined }
    }
    return {
        status: hasUsableTokens(credential) ? 'connected' : 'expired',
        expiresAt: credential.expiresAt?.toISOString() ?? null,
        scopes: credential.scopes ?? undefined
    }
}

function runtimeSessionForCredential(credential: McpConsumerOAuthCredential, serverUrl: string) {
    return {
        id: `runtime-${credential.id}`,
        tenantId: credential.tenantId,
        organizationId: credential.organizationId,
        workspaceId: credential.workspaceId,
        toolsetId: credential.toolsetId,
        serverName: credential.serverName,
        subjectType: credential.subjectType,
        subjectId: credential.subjectId,
        userId: credential.subjectType === 'user' ? credential.subjectId : credential.createdById,
        serverUrl,
        redirectUri: 'http://localhost/mcp-oauth/runtime',
        stateHash: '',
        expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
        createdAt: new Date(),
        updatedAt: new Date()
    } as McpConsumerOAuthSession
}
