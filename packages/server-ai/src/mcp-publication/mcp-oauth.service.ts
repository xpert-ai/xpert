import type { McpPrincipal } from '@xpert-ai/contracts'
import { decryptSecret, encryptSecret, User } from '@xpert-ai/server-core'
import { environment } from '@xpert-ai/server-config'
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import type { JWTPayload } from 'jose'
import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { FindOptionsWhere, Repository } from 'typeorm'
import { McpOAuthPolicy, McpPublication } from './entities'
import { UpsertMcpOAuthPolicyInput } from './mcp-publication.dto'
import { McpPublicationService } from './mcp-publication.service'
import { McpSubscriptionService } from './mcp-subscription.service'

type JoseModule = typeof import('jose')
type RemoteJwkSet = ReturnType<JoseModule['createRemoteJWKSet']>

interface AuthorizationServerMetadata {
    issuer: string
    jwksUri: string
    authorizationEndpoint?: string
    tokenEndpoint?: string
    introspectionEndpoint?: string
    scopesSupported?: string[]
}

interface TokenIntrospectionResult {
    active: true
    subject?: string
    clientId?: string
    scopes?: string[]
}

const DISCOVERY_TTL_MS = 5 * 60 * 1000
const DISCOVERY_MAX_BYTES = 128 * 1024
const CLAIM_NAME_PATTERN = /^[A-Za-z0-9_.:-]{1,100}$/
const OAUTH_REMOTE_MAX_BYTES = 128 * 1024
const NON_PUBLIC_NETWORKS = createNonPublicNetworkBlockList()

@Injectable()
export class McpOAuthService {
    readonly #metadata = new Map<string, { expiresAt: number; value: AuthorizationServerMetadata }>()
    readonly #jwks = new Map<string, RemoteJwkSet>()

    constructor(
        @InjectRepository(McpOAuthPolicy)
        private readonly policyRepository: Repository<McpOAuthPolicy>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly publications: McpPublicationService,
        private readonly subscriptions: McpSubscriptionService
    ) {}

    async getManaged(publicationId: string) {
        const publication = await this.publications.getManaged(publicationId)
        const policy = await this.policyRepository.findOne({
            where: { publicationId: publication.id, tenantId: publication.tenantId }
        })
        return policy ? managedOAuthPolicy(policy) : null
    }
    async upsert(publicationId: string, input: UpsertMcpOAuthPolicyInput) {
        const publication = await this.publications.getManaged(publicationId)
        const issuer = normalizeTrustedUrl(input.issuer, 'issuer').toString().replace(/\/$/, '')
        if (!input.audience?.trim() || input.audience.length > 500) {
            throw new BadRequestException(
                t('server-ai:Error.McpOAuthInvalidAudience', {
                    defaultValue: 'OAuth audience is required and must not exceed 500 characters.'
                })
            )
        }
        const subjectMapping = input.subjectMapping ?? {
            subjectClaim: 'sub',
            emailClaim: 'email',
            clientIdClaim: 'azp'
        }
        for (const claim of [
            subjectMapping.subjectClaim,
            subjectMapping.emailClaim,
            subjectMapping.clientIdClaim
        ].filter((value): value is string => typeof value === 'string')) {
            if (!CLAIM_NAME_PATTERN.test(claim)) {
                throw new BadRequestException(
                    t('server-ai:Error.McpOAuthInvalidClaim', {
                        defaultValue: `OAuth claim name '${claim}' is invalid.`,
                        claim
                    })
                )
            }
        }
        const requiredScopes = normalizeScopes(input.requiredScopes)
        const current = await this.policyRepository.findOne({ where: { publicationId: publication.id } })
        const introspection = normalizeIntrospectionPolicy(input, current)
        const entity = this.policyRepository.create({
            ...(current ?? {}),
            publicationId: publication.id,
            tenantId: publication.tenantId,
            organizationId: publication.organizationId ?? null,
            issuer,
            audience: input.audience.trim(),
            requiredScopes,
            subjectMapping,
            ...introspection,
            enabled: input.enabled ?? true
        })
        this.#metadata.delete(issuer)
        const saved = await this.policyRepository.save(entity)
        this.subscriptions.publishAccessInvalidated(publication.id)
        return managedOAuthPolicy(saved)
    }

    async test(publicationId: string) {
        const policy = await this.getManaged(publicationId)
        if (!policy) throw this.unauthorized()
        const metadata = await this.discover(policy.issuer)
        return {
            issuer: metadata.issuer,
            authorizationEndpoint: metadata.authorizationEndpoint,
            tokenEndpoint: metadata.tokenEndpoint,
            introspectionEndpoint: metadata.introspectionEndpoint,
            introspectionEnabled: policy.introspectionEnabled,
            introspectionClientSecretConfigured: policy.introspectionClientSecretConfigured,
            jwksUri: metadata.jwksUri,
            scopesSupported: metadata.scopesSupported ?? []
        }
    }

    async authenticate(publication: McpPublication, token: string): Promise<McpPrincipal> {
        if (!publication.authMethods.includes('oauth')) throw this.unauthorized()
        const policy = await this.findRuntimePolicy(publication)
        if (!policy) throw this.unauthorized()
        try {
            const metadata = await this.discover(policy.issuer)
            const jose = await import('jose')
            let jwks = this.#jwks.get(metadata.jwksUri)
            if (!jwks) {
                const jwksUrl = normalizeTrustedUrl(metadata.jwksUri, 'JWKS')
                jwks = jose.createRemoteJWKSet(jwksUrl, {
                    timeoutDuration: 5_000,
                    cooldownDuration: 30_000,
                    cacheMaxAge: 10 * 60 * 1000,
                    [jose.customFetch]: (url, options) => guardedOAuthFetch(url, 'JWKS', options)
                })
                this.#jwks.set(metadata.jwksUri, jwks)
            }
            const { payload } = await jose.jwtVerify(token, jwks, {
                issuer: policy.issuer,
                audience: policy.audience,
                requiredClaims: [policy.subjectMapping.subjectClaim],
                clockTolerance: 30
            })
            const introspection = policy.introspectionEnabled
                ? await this.introspectToken(policy, metadata, token)
                : undefined
            const tokenSubject = readStringClaim(payload, policy.subjectMapping.subjectClaim)
            if (introspection?.subject && introspection.subject !== tokenSubject) throw this.unauthorized()
            const scopes = introspection?.scopes ?? tokenScopes(payload)
            if (policy.requiredScopes.some((scope) => !scopes.includes(scope))) {
                throw this.unauthorized()
            }
            const user = await this.resolveUser(publication, policy, payload)
            const clientId = introspection?.clientId ?? readStringClaim(payload, policy.subjectMapping.clientIdClaim)
            return {
                authMethod: 'oauth',
                subjectType: 'user',
                subjectId: user.id,
                userId: user.id,
                ...(clientId ? { clientId } : {}),
                tenantId: publication.tenantId,
                organizationId: publication.organizationId ?? undefined,
                publicationId: publication.id,
                scopes
            }
        } catch (error) {
            if (error instanceof UnauthorizedException) throw error
            throw this.unauthorized()
        }
    }

    async protectedResourceMetadata(publication: McpPublication, resourceUrl: string) {
        const policy = await this.policyRepository.findOne({
            where: { publicationId: publication.id, tenantId: publication.tenantId, enabled: true }
        })
        if (!policy) throw this.unauthorized()
        return {
            resource: resourceUrl,
            authorization_servers: [policy.issuer],
            bearer_methods_supported: ['header'],
            scopes_supported: policy.requiredScopes
        }
    }

    async challenge(publication: McpPublication, resourceMetadataUrl: string) {
        const policy = await this.policyRepository.findOne({
            where: { publicationId: publication.id, tenantId: publication.tenantId, enabled: true }
        })
        const scope = policy?.requiredScopes.length ? `, scope="${policy.requiredScopes.join(' ')}"` : ''
        return `Bearer resource_metadata="${resourceMetadataUrl}"${scope}`
    }

    private async resolveUser(publication: McpPublication, policy: McpOAuthPolicy, payload: JWTPayload) {
        const subject = readStringClaim(payload, policy.subjectMapping.subjectClaim)
        if (!subject) throw this.unauthorized()
        const email = readStringClaim(payload, policy.subjectMapping.emailClaim)
        const where: FindOptionsWhere<User>[] = [{ tenantId: publication.tenantId, thirdPartyId: subject }]
        if (isUuid(subject)) where.unshift({ tenantId: publication.tenantId, id: subject })
        if (email) where.push({ tenantId: publication.tenantId, email })
        const user = await this.userRepository.findOne({ where })
        if (!user) throw this.unauthorized()
        return user
    }

    private findRuntimePolicy(publication: McpPublication) {
        return this.policyRepository
            .createQueryBuilder('policy')
            .addSelect('policy.introspectionClientSecretEncrypted')
            .where('policy.publicationId = :publicationId', { publicationId: publication.id })
            .andWhere('policy.tenantId = :tenantId', { tenantId: publication.tenantId })
            .andWhere('policy.enabled = :enabled', { enabled: true })
            .getOne()
    }

    private async introspectToken(
        policy: McpOAuthPolicy,
        metadata: AuthorizationServerMetadata,
        token: string
    ): Promise<TokenIntrospectionResult> {
        const endpoint = policy.introspectionEndpoint ?? metadata.introspectionEndpoint
        if (!endpoint) throw this.unauthorized()
        const headers = new Headers({
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded'
        })
        const encryptedSecret = policy.introspectionClientSecretEncrypted
        if (policy.introspectionClientId || encryptedSecret) {
            if (!policy.introspectionClientId || !encryptedSecret) throw this.unauthorized()
            const secret = decryptSecret(encryptedSecret, environment.secretsEncryptionKey)
            headers.set(
                'authorization',
                `Basic ${Buffer.from(`${policy.introspectionClientId}:${secret}`, 'utf8').toString('base64')}`
            )
        }
        const body = new URLSearchParams({ token, token_type_hint: 'access_token' })
        const response = await guardedOAuthFetch(endpoint, 'OAuth introspection', {
            method: 'POST',
            headers,
            body,
            signal: AbortSignal.timeout(5_000)
        })
        if (!response.ok) throw this.unauthorized()
        return parseTokenIntrospectionResponse(JSON.parse(await response.text()))
    }

    private async discover(issuer: string): Promise<AuthorizationServerMetadata> {
        const cached = this.#metadata.get(issuer)
        if (cached && cached.expiresAt > Date.now()) return cached.value
        const issuerUrl = normalizeTrustedUrl(issuer, 'issuer')
        const candidates = [
            new URL('.well-known/openid-configuration', `${issuerUrl.toString().replace(/\/$/, '')}/`),
            new URL('.well-known/oauth-authorization-server', `${issuerUrl.toString().replace(/\/$/, '')}/`)
        ]
        let lastError: unknown
        for (const url of candidates) {
            try {
                const response = await guardedOAuthFetch(url, 'OAuth discovery', {
                    headers: { accept: 'application/json' },
                    signal: AbortSignal.timeout(5_000)
                })
                if (!response.ok) throw new Error(`HTTP ${response.status}`)
                const text = await response.text()
                if (Buffer.byteLength(text, 'utf8') > DISCOVERY_MAX_BYTES) {
                    throw new Error('authorization server metadata is too large')
                }
                const metadata = parseAuthorizationServerMetadata(JSON.parse(text), issuer)
                this.#metadata.set(issuer, { expiresAt: Date.now() + DISCOVERY_TTL_MS, value: metadata })
                return metadata
            } catch (error) {
                lastError = error
            }
        }
        throw new BadRequestException(
            t('server-ai:Error.McpOAuthDiscoveryFailed', {
                defaultValue: `OAuth authorization server discovery failed: ${errorMessage(lastError)}`,
                reason: errorMessage(lastError)
            })
        )
    }

    private unauthorized() {
        return new UnauthorizedException(
            t('server-ai:Error.McpOAuthUnauthorized', {
                defaultValue: 'The OAuth access token is missing, invalid, expired, or no longer authorized.'
            })
        )
    }
}

function parseAuthorizationServerMetadata(value: unknown, expectedIssuer: string): AuthorizationServerMetadata {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('authorization server metadata is invalid')
    }
    const issuer = Reflect.get(value, 'issuer')
    const jwksUri = Reflect.get(value, 'jwks_uri')
    if (issuer !== expectedIssuer || typeof jwksUri !== 'string') {
        throw new Error('authorization server metadata issuer or JWKS URI is invalid')
    }
    normalizeTrustedUrl(jwksUri, 'JWKS')
    const authorizationEndpoint = Reflect.get(value, 'authorization_endpoint')
    const tokenEndpoint = Reflect.get(value, 'token_endpoint')
    const introspectionEndpoint = Reflect.get(value, 'introspection_endpoint')
    const scopes = Reflect.get(value, 'scopes_supported')
    return {
        issuer,
        jwksUri,
        ...(typeof authorizationEndpoint === 'string' ? { authorizationEndpoint } : {}),
        ...(typeof tokenEndpoint === 'string' ? { tokenEndpoint } : {}),
        ...(typeof introspectionEndpoint === 'string'
            ? { introspectionEndpoint: normalizeTrustedUrl(introspectionEndpoint, 'OAuth introspection').toString() }
            : {}),
        ...(Array.isArray(scopes) && scopes.every((scope) => typeof scope === 'string')
            ? { scopesSupported: scopes }
            : {})
    }
}

function normalizeTrustedUrl(value: string, label: string) {
    let url: URL
    try {
        url = new URL(value)
    } catch {
        throw new BadRequestException(
            t('server-ai:Error.McpOAuthInvalidUrl', {
                defaultValue: '{{label}} URL is invalid.',
                label
            })
        )
    }
    const hostname = normalizeHostname(url.hostname)
    const localDevelopmentHost = !isProductionRuntime() && isLocalhost(hostname)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localDevelopmentHost)) {
        throw new BadRequestException(
            t('server-ai:Error.McpOAuthHttpsRequired', {
                defaultValue: '{{label}} URL must use HTTPS.',
                label
            })
        )
    }
    if (url.username || url.password || url.hash) {
        throw new BadRequestException(
            t('server-ai:Error.McpOAuthUnsafeUrl', {
                defaultValue: '{{label}} URL must not contain credentials or fragments.',
                label
            })
        )
    }
    if (isIP(hostname) && isNonPublicAddress(hostname) && !isPrivateHostAllowed(hostname)) {
        throw privateNetworkDenied(label)
    }
    return url
}

async function guardedOAuthFetch(
    value: string | URL,
    label: string,
    init: Pick<RequestInit, 'body' | 'headers' | 'method' | 'signal'>
) {
    const url = normalizeTrustedUrl(value.toString(), label)
    await assertPublicResolution(url, label)
    const response = await fetch(url, { ...init, redirect: 'manual' })
    if (response.status >= 300 && response.status < 400) {
        throw new Error(`${label} redirects are not allowed`)
    }
    const contentLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > OAUTH_REMOTE_MAX_BYTES) {
        throw new Error(`${label} response is too large`)
    }
    const body = await readBoundedResponseBody(response, OAUTH_REMOTE_MAX_BYTES, label)
    const headers = new Headers(response.headers)
    headers.delete('content-encoding')
    headers.set('content-length', String(body.byteLength))
    return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers
    })
}

async function assertPublicResolution(url: URL, label: string) {
    const hostname = normalizeHostname(url.hostname)
    if (isPrivateHostAllowed(hostname)) return
    if (isIP(hostname)) {
        if (isNonPublicAddress(hostname)) throw privateNetworkDenied(label)
        return
    }
    const addresses = await lookup(hostname, { all: true, verbatim: true })
    if (!addresses.length || addresses.some(({ address }) => isNonPublicAddress(address))) {
        throw privateNetworkDenied(label)
    }
}

async function readBoundedResponseBody(response: Response, maxBytes: number, label: string) {
    if (!response.body) return new Uint8Array()
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    let complete = false
    try {
        while (!complete) {
            const { done, value } = await reader.read()
            if (done) {
                complete = true
                continue
            }
            total += value.byteLength
            if (total > maxBytes) {
                await reader.cancel()
                throw new Error(`${label} response is too large`)
            }
            chunks.push(value)
        }
    } finally {
        reader.releaseLock()
    }
    const body = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
        body.set(chunk, offset)
        offset += chunk.byteLength
    }
    return body
}

function isProductionRuntime() {
    return environment.production || process.env.NODE_ENV === 'production'
}

function isPrivateHostAllowed(hostname: string) {
    if (!isProductionRuntime() && isLocalhost(hostname)) return true
    return (process.env.XPERT_MCP_OAUTH_PRIVATE_HOST_ALLOWLIST ?? '')
        .split(',')
        .map((value) => normalizeHostname(value.trim()))
        .filter(Boolean)
        .includes(hostname)
}

function normalizeHostname(hostname: string) {
    return hostname.replace(/^\[|\]$/g, '').toLowerCase()
}

function isLocalhost(hostname: string) {
    return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1' || hostname === '::1'
}

function isNonPublicAddress(address: string) {
    const family = isIP(address)
    return family === 4
        ? NON_PUBLIC_NETWORKS.check(address, 'ipv4')
        : family === 6
          ? NON_PUBLIC_NETWORKS.check(address, 'ipv6')
          : true
}

function createNonPublicNetworkBlockList() {
    const blockList = new BlockList()
    for (const [address, prefix] of [
        ['0.0.0.0', 8],
        ['10.0.0.0', 8],
        ['100.64.0.0', 10],
        ['127.0.0.0', 8],
        ['169.254.0.0', 16],
        ['172.16.0.0', 12],
        ['192.0.0.0', 24],
        ['192.0.2.0', 24],
        ['192.168.0.0', 16],
        ['198.18.0.0', 15],
        ['198.51.100.0', 24],
        ['203.0.113.0', 24],
        ['224.0.0.0', 3]
    ] as const) {
        blockList.addSubnet(address, prefix, 'ipv4')
    }
    for (const [address, prefix] of [
        ['::', 128],
        ['::1', 128],
        ['100::', 64],
        ['2001:db8::', 32],
        ['fc00::', 7],
        ['fe80::', 10],
        ['ff00::', 8]
    ] as const) {
        blockList.addSubnet(address, prefix, 'ipv6')
    }
    return blockList
}

function privateNetworkDenied(label: string) {
    return new BadRequestException(
        t('server-ai:Error.McpOAuthPrivateNetworkDenied', {
            defaultValue: '{{label}} URL must not resolve to a private, loopback, link-local, or reserved network.',
            label
        })
    )
}

function tokenScopes(payload: JWTPayload) {
    const scope = payload.scope
    const scp = payload.scp
    const values = [
        ...(typeof scope === 'string' ? scope.split(/\s+/) : []),
        ...(typeof scp === 'string' ? scp.split(/\s+/) : []),
        ...(Array.isArray(scp) ? scp.filter((item): item is string => typeof item === 'string') : [])
    ]
    return [...new Set(values.filter(Boolean))]
}

function parseTokenIntrospectionResponse(value: unknown): TokenIntrospectionResult {
    if (typeof value !== 'object' || value === null || Array.isArray(value) || Reflect.get(value, 'active') !== true) {
        throw new UnauthorizedException()
    }
    const subject = Reflect.get(value, 'sub')
    const clientId = Reflect.get(value, 'client_id')
    const scope = Reflect.get(value, 'scope')
    if (subject !== undefined && typeof subject !== 'string') throw new UnauthorizedException()
    if (clientId !== undefined && typeof clientId !== 'string') throw new UnauthorizedException()
    if (scope !== undefined && typeof scope !== 'string') throw new UnauthorizedException()
    const normalizedSubject = typeof subject === 'string' ? subject : undefined
    const normalizedClientId = typeof clientId === 'string' ? clientId : undefined
    const normalizedScope = typeof scope === 'string' ? scope : undefined
    return {
        active: true,
        ...(normalizedSubject ? { subject: normalizedSubject } : {}),
        ...(normalizedClientId ? { clientId: normalizedClientId } : {}),
        ...(normalizedScope ? { scopes: [...new Set(normalizedScope.split(/\s+/).filter(Boolean))] } : {})
    }
}

function managedOAuthPolicy(policy: McpOAuthPolicy) {
    const value = { ...policy }
    delete value.introspectionClientSecretEncrypted
    return value
}

function normalizeIntrospectionPolicy(input: UpsertMcpOAuthPolicyInput, current: McpOAuthPolicy | null) {
    const requested = input.introspection
    if (!requested) {
        return {
            introspectionEnabled: current?.introspectionEnabled ?? false,
            introspectionEndpoint: current?.introspectionEndpoint ?? null,
            introspectionClientId: current?.introspectionClientId ?? null,
            introspectionClientSecretConfigured: current?.introspectionClientSecretConfigured ?? false
        }
    }
    const introspectionEndpoint = requested.endpoint?.trim()
        ? normalizeTrustedUrl(requested.endpoint, 'OAuth introspection').toString()
        : null
    const introspectionClientId = requested.clientId?.trim() || null
    const hasCurrentSecret = current?.introspectionClientSecretConfigured ?? false
    const hasNextSecret =
        requested.clientSecret === undefined ? hasCurrentSecret : Boolean(requested.clientSecret?.trim())
    if (Boolean(introspectionClientId) !== hasNextSecret) {
        throw new BadRequestException(
            t('server-ai:Error.McpOAuthIntrospectionCredentials', {
                defaultValue:
                    'OAuth introspection client ID and client secret must either both be configured or both be omitted.'
            })
        )
    }
    return {
        introspectionEnabled: requested.enabled,
        introspectionEndpoint,
        introspectionClientId,
        introspectionClientSecretConfigured: hasNextSecret,
        ...(requested.clientSecret !== undefined
            ? {
                  introspectionClientSecretEncrypted: requested.clientSecret?.trim()
                      ? encryptSecret(requested.clientSecret.trim(), environment.secretsEncryptionKey)
                      : null
              }
            : {})
    }
}

function readStringClaim(payload: JWTPayload, claim?: string) {
    const value = claim ? payload[claim] : undefined
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeScopes(scopes?: string[]) {
    const result = [...new Set((scopes ?? []).map((scope) => scope.trim()))]
    if (result.some((scope) => !scope || scope.length > 191)) {
        throw new BadRequestException(
            t('server-ai:Error.McpOAuthInvalidScope', {
                defaultValue: 'OAuth scope is invalid.'
            })
        )
    }
    return result
}

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}
