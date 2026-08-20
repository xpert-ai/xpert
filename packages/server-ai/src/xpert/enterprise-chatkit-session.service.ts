import {
    IXpert,
    isEnterpriseH5Platform,
    SecretTokenBindingType,
    TEnterpriseH5Platform,
    TIntegrationProvider
} from '@xpert-ai/contracts'
import {
    IntegrationExternalIdentity,
    IntegrationIdentityBootstrap,
    IntegrationIdentityGrant,
    IntegrationStrategy
} from '@xpert-ai/plugin-sdk'
import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    ServiceUnavailableException,
    UnauthorizedException
} from '@nestjs/common'
import { AccountBindingService, IntegrationService, RequestContext, SecretTokenService } from '@xpert-ai/server-core'
import { randomBytes } from 'crypto'
import { t } from 'i18next'
import { DataSource } from 'typeorm'

const ENTERPRISE_CHATKIT_SESSION_TTL_SECONDS = 600
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Published Xpert fields safe to expose through the anonymous H5 bootstrap endpoint. */
export type EnterpriseH5Xpert = Pick<
    IXpert,
    | 'id'
    | 'slug'
    | 'name'
    | 'type'
    | 'description'
    | 'avatar'
    | 'title'
    | 'titleCN'
    | 'version'
    | 'publishAt'
    | 'starters'
    | 'features'
    | 'tenantId'
    | 'organizationId'
    | 'app'
>

/** Bootstrap response returned before enterprise identity verification. */
export type EnterpriseH5ChatAppBootstrap = {
    xpert: EnterpriseH5Xpert
    platform: TEnterpriseH5Platform
    clientConfig: Record<string, unknown>
}

/** Non-null provider capability required to serve an enterprise H5 platform. */
type EnterpriseH5IdentityCapability = NonNullable<TIntegrationProvider['enterpriseH5']>

@Injectable()
export class EnterpriseChatkitSessionService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly integrationService: IntegrationService,
        private readonly accountBindingService: AccountBindingService,
        private readonly secretTokenService: SecretTokenService
    ) {}

    async getBootstrap(identifier: string, platformValue: string): Promise<EnterpriseH5ChatAppBootstrap> {
        const platform = requireEnterpriseH5Platform(platformValue)
        const { xpert, bootstrap } = await this.resolveContext(identifier, platform)
        return {
            xpert,
            platform,
            clientConfig: bootstrap.clientConfig
        }
    }

    async createSession(identifier: string, platformValue: string, input: { grant?: IntegrationIdentityGrant }) {
        const platform = requireEnterpriseH5Platform(platformValue)
        const grant = requireIdentityGrant(input.grant)
        const { xpert, integration, strategy, capability, bootstrap } = await this.resolveContext(identifier, platform)
        const exchangeIdentity = strategy.exchangeIdentity
        if (!exchangeIdentity) {
            throw new ServiceUnavailableException(t('server-ai:Error.EnterpriseH5IdentityExchangeUnsupported'))
        }

        let identity: IntegrationExternalIdentity
        try {
            identity = await exchangeIdentity.call(strategy, integration, grant)
        } catch {
            throw new UnauthorizedException(t('server-ai:Error.EnterpriseH5IdentityVerificationFailed'))
        }

        this.assertIdentity(identity, capability, bootstrap.externalOrganizationId)
        const user = await this.resolveBoundUser(identity, xpert.tenantId)
        if (!user) {
            return {
                status: 'account_binding_required' as const,
                accountBindingProvider: identity.accountBinding!.provider
            }
        }

        const token = `cs-x-${randomBytes(32).toString('hex')}`
        const validUntil = new Date(Date.now() + 1000 * ENTERPRISE_CHATKIT_SESSION_TTL_SECONDS)

        await this.secretTokenService.create({
            entityId: xpert.id,
            type: SecretTokenBindingType.ENTERPRISE_XPERT,
            tenantId: xpert.tenantId,
            organizationId: xpert.organizationId,
            createdById: user.id,
            enterpriseH5Scope: {
                platform,
                integrationId: integration.id
            },
            token,
            validUntil
        })

        return {
            client_secret: token,
            expires_at: validUntil,
            expires_after: ENTERPRISE_CHATKIT_SESSION_TTL_SECONDS,
            xpertId: xpert.id,
            assistantId: xpert.id,
            organizationId: xpert.organizationId
        }
    }

    private async resolveContext(identifier: string, platform: TEnterpriseH5Platform) {
        const xpert = await this.findEnterpriseH5Xpert(identifier, platform)
        const integrationId = requireIntegrationId(xpert, platform)
        const integration = await this.integrationService.findOneByIdWithinTenant(integrationId, xpert.tenantId)

        if (!integration.organizationId || integration.organizationId !== xpert.organizationId) {
            throw new ForbiddenException(t('server-ai:Error.EnterpriseH5IntegrationUnavailable'))
        }

        const strategy = this.integrationService.getIntegrationStrategy(
            integration.provider,
            integration.organizationId
        )
        const capability = strategy.meta.enterpriseH5
        if (capability?.platform !== platform) {
            throw new ForbiddenException(t('server-ai:Error.EnterpriseH5IntegrationUnavailable'))
        }
        if (!strategy.getIdentityBootstrap) {
            throw new ServiceUnavailableException(t('server-ai:Error.EnterpriseH5BootstrapUnsupported'))
        }

        let bootstrap: IntegrationIdentityBootstrap
        try {
            bootstrap = await strategy.getIdentityBootstrap(integration)
        } catch {
            throw new BadRequestException(t('server-ai:Error.EnterpriseH5BootstrapInvalid'))
        }
        if (
            !bootstrap.externalOrganizationId?.trim() ||
            !bootstrap.clientConfig ||
            typeof bootstrap.clientConfig !== 'object' ||
            Array.isArray(bootstrap.clientConfig)
        ) {
            throw new BadRequestException(t('server-ai:Error.EnterpriseH5BootstrapInvalid'))
        }

        return {
            xpert,
            integration,
            strategy,
            capability,
            bootstrap: {
                ...bootstrap,
                externalOrganizationId: bootstrap.externalOrganizationId.trim()
            }
        }
    }

    private async findEnterpriseH5Xpert(identifier: string, platform: TEnterpriseH5Platform) {
        const normalized = identifier?.trim()
        const tenantId = RequestContext.getScope().tenantId
        if (!normalized || !tenantId) {
            throw new NotFoundException(t('server-ai:Error.EnterpriseH5XpertNotFound', { identifier }))
        }

        const query = this.dataSource
            .createQueryBuilder()
            .select('xpert.*')
            .from('xpert', 'xpert')
            .where(`xpert.${UUID_PATTERN.test(normalized) ? 'id' : 'slug'} = :identifier`, {
                identifier: normalized
            })
            .andWhere('xpert."tenantId" = :tenantId', { tenantId })
            .andWhere('xpert."publishAt" IS NOT NULL')

        if (!UUID_PATTERN.test(normalized)) {
            query.andWhere('xpert.latest = true')
        }

        const xpert = await query.getRawOne<EnterpriseH5Xpert>()
        if (
            !xpert?.organizationId ||
            !xpert.app?.enabled ||
            !xpert.app.channels?.[platform]?.enabled ||
            !xpert.app.channels[platform].integrationId?.trim()
        ) {
            throw new NotFoundException(t('server-ai:Error.EnterpriseH5XpertNotFound', { identifier }))
        }

        return xpert
    }

    private assertIdentity(
        identity: IntegrationExternalIdentity,
        capability: EnterpriseH5IdentityCapability,
        externalOrganizationId: string
    ) {
        const accountBinding = identity.accountBinding
        if (
            identity.provider !== capability.externalIdentityProvider ||
            identity.externalOrganizationId !== externalOrganizationId ||
            !identity.subjectId?.trim() ||
            !accountBinding ||
            !capability.accountBindingProvider ||
            accountBinding.provider !== capability.accountBindingProvider ||
            !accountBinding.subjectId?.trim()
        ) {
            throw new UnauthorizedException(t('server-ai:Error.EnterpriseH5IdentityMismatch'))
        }
    }

    private resolveBoundUser(identity: IntegrationExternalIdentity, tenantId: string) {
        return this.accountBindingService.resolveUser({
            tenantId,
            provider: identity.accountBinding!.provider,
            subjectId: identity.accountBinding!.subjectId.trim()
        })
    }
}

function requireEnterpriseH5Platform(value: string) {
    if (!isEnterpriseH5Platform(value)) {
        throw new BadRequestException(t('server-ai:Error.EnterpriseH5PlatformUnsupported'))
    }
    return value
}

function requireIdentityGrant(grant?: IntegrationIdentityGrant) {
    if (grant?.type !== 'authorization_code' || !grant.code?.trim()) {
        throw new BadRequestException(t('server-ai:Error.EnterpriseH5AuthorizationCodeRequired'))
    }
    return {
        type: 'authorization_code',
        code: grant.code.trim()
    } satisfies IntegrationIdentityGrant
}

function requireIntegrationId(xpert: EnterpriseH5Xpert, platform: TEnterpriseH5Platform) {
    const integrationId = xpert.app?.channels?.[platform]?.integrationId?.trim()
    if (!integrationId) {
        throw new BadRequestException(t('server-ai:Error.EnterpriseH5IntegrationRequired'))
    }
    return integrationId
}
