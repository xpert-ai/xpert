import { McpPrincipal } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { Repository } from 'typeorm'
import { McpApiKey, McpPublication } from './entities'
import { CreateMcpApiKeyInput } from './mcp-publication.dto'
import { McpPublicationService } from './mcp-publication.service'
import { McpSubscriptionService } from './mcp-subscription.service'

const API_KEY_PREFIX = 'xpert_mcp_'
const STORED_PREFIX_LENGTH = 24

export interface CreatedMcpApiKey {
    apiKey: Omit<McpApiKey, 'keyHash'>
    secret: string
}

@Injectable()
export class McpApiKeyService {
    constructor(
        @InjectRepository(McpApiKey)
        private readonly keyRepository: Repository<McpApiKey>,
        private readonly publications: McpPublicationService,
        private readonly subscriptions: McpSubscriptionService
    ) {}

    async create(publicationId: string, input: CreateMcpApiKeyInput): Promise<CreatedMcpApiKey> {
        const publication = await this.publications.getManaged(publicationId)
        return this.createForPublication(publication, input)
    }

    async list(publicationId: string) {
        const publication = await this.publications.getManaged(publicationId)
        return this.keyRepository.find({
            where: { publicationId: publication.id, tenantId: publication.tenantId },
            order: { createdAt: 'DESC' }
        })
    }

    async revoke(keyId: string) {
        const key = await this.keyRepository.findOne({ where: { id: keyId } })
        if (!key) {
            throw new BadRequestException(
                t('server-ai:Error.McpApiKeyNotFound', { defaultValue: 'MCP API key was not found.' })
            )
        }
        await this.publications.getManaged(key.publicationId)
        key.revokedAt = new Date()
        key.revokedById = RequestContext.currentUserId()
        const saved = await this.keyRepository.save(key)
        this.subscriptions.publishAccessInvalidated(key.publicationId)
        return saved
    }

    async rotate(keyId: string): Promise<CreatedMcpApiKey> {
        const key = await this.keyRepository.findOne({ where: { id: keyId } })
        if (!key) {
            throw new BadRequestException(
                t('server-ai:Error.McpApiKeyNotFound', { defaultValue: 'MCP API key was not found.' })
            )
        }
        const publication = await this.publications.getManaged(key.publicationId)
        key.revokedAt = new Date()
        key.revokedById = RequestContext.currentUserId()
        await this.keyRepository.save(key)
        this.subscriptions.publishAccessInvalidated(key.publicationId)
        return this.createForPublication(publication, {
            name: key.name,
            subjectType: key.subjectType,
            subjectId: key.subjectId,
            scopes: key.scopes,
            expiresAt: key.expiresAt
        })
    }

    async authenticate(publication: McpPublication, authorization?: string): Promise<McpPrincipal> {
        if (!publication.authMethods.includes('api_key')) {
            throw this.unauthorized()
        }
        const secret = bearerToken(authorization)
        if (!secret.startsWith(API_KEY_PREFIX) || secret.length < STORED_PREFIX_LENGTH) {
            throw this.unauthorized()
        }
        const keyPrefix = secret.slice(0, STORED_PREFIX_LENGTH)
        const key = await this.keyRepository
            .createQueryBuilder('apiKey')
            .addSelect('apiKey.keyHash')
            .where('apiKey.keyPrefix = :keyPrefix', { keyPrefix })
            .andWhere('apiKey.publicationId = :publicationId', { publicationId: publication.id })
            .andWhere('apiKey.revokedAt IS NULL')
            .getOne()
        if (!key || key.expiresAt?.getTime() <= Date.now() || !hashMatches(secret, key.keyHash)) {
            throw this.unauthorized()
        }
        await this.keyRepository.update(key.id, { lastUsedAt: new Date() })
        return {
            authMethod: 'api_key',
            credentialPrefix: key.keyPrefix,
            subjectType: key.subjectType,
            subjectId: key.subjectId,
            ...(key.subjectType === 'user' ? { userId: key.subjectId } : { clientId: key.subjectId }),
            tenantId: publication.tenantId,
            organizationId: publication.organizationId ?? undefined,
            publicationId: publication.id,
            scopes: key.scopes
        }
    }

    private async createForPublication(
        publication: McpPublication,
        input: CreateMcpApiKeyInput
    ): Promise<CreatedMcpApiKey> {
        const currentUserId = RequestContext.currentUserId()
        const subjectType = input.subjectType ?? 'user'
        const subjectId = input.subjectId ?? currentUserId
        if (!input.name?.trim() || !subjectId) {
            throw new BadRequestException(
                t('server-ai:Error.McpApiKeyInvalidInput', {
                    defaultValue: 'MCP API key name and subject are required.'
                })
            )
        }
        const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
        if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) {
            throw new BadRequestException(
                t('server-ai:Error.McpApiKeyInvalidExpiry', {
                    defaultValue: 'MCP API key expiry must be in the future.'
                })
            )
        }
        const secret = `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`
        const entity = await this.keyRepository.save(
            this.keyRepository.create({
                publicationId: publication.id,
                tenantId: publication.tenantId,
                organizationId: publication.organizationId ?? null,
                name: input.name.trim(),
                keyPrefix: secret.slice(0, STORED_PREFIX_LENGTH),
                keyHash: hashSecret(secret),
                subjectType,
                subjectId,
                scopes: normalizeScopes(input.scopes),
                expiresAt,
                createdById: currentUserId,
                updatedById: currentUserId
            })
        )
        const { keyHash, ...apiKey } = entity
        void keyHash
        return { apiKey, secret }
    }

    private unauthorized() {
        return new UnauthorizedException(
            t('server-ai:Error.McpApiKeyUnauthorized', {
                defaultValue: 'The MCP bearer credential is missing, invalid, expired, or revoked.'
            })
        )
    }
}

function bearerToken(authorization?: string) {
    const [scheme, token, extra] = authorization?.trim().split(/\s+/) ?? []
    return scheme?.toLowerCase() === 'bearer' && token && !extra ? token : ''
}

function hashSecret(secret: string) {
    return createHash('sha256').update(secret).digest('hex')
}

function hashMatches(secret: string, expected: string) {
    const actualBuffer = Buffer.from(hashSecret(secret), 'hex')
    const expectedBuffer = Buffer.from(expected, 'hex')
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

function normalizeScopes(scopes?: string[]) {
    const normalized = [
        ...new Set((scopes?.length ? scopes : ['tools:list', 'tools:call']).map((scope) => scope.trim()))
    ]
    if (normalized.some((scope) => !scope || scope.length > 191)) {
        throw new BadRequestException(
            t('server-ai:Error.McpApiKeyInvalidScope', { defaultValue: 'MCP API key scope is invalid.' })
        )
    }
    return normalized
}
