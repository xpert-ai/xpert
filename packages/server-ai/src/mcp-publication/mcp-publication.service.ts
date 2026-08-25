import {
    IMcpCapabilitySourceSummary,
    MCP_AUTH_METHODS,
    MCP_PROTOCOL_VERSION,
    McpAuthMethod,
    McpCapabilityType,
    McpPublicationStatus
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { In, IsNull, Repository } from 'typeorm'
import { compareMcpCapabilityDescriptors } from '../tool-runtime'
import { XpertToolset } from '../xpert-toolset/xpert-toolset.entity'
import {
    McpApiKey,
    McpCapabilityCatalog,
    McpInvocationAudit,
    McpOAuthPolicy,
    McpPublication,
    McpPublicationCapability
} from './entities'
import {
    CreateMcpPublicationInput,
    McpCapabilityBindingInput,
    PatchMcpCapabilityBindingInput,
    UpdateMcpPublicationInput
} from './mcp-publication.dto'
import { McpSubscriptionService } from './mcp-subscription.service'
import { assertMcpOAuthEnabled, isMcpOAuthEnabled } from './mcp-oauth-feature'

const PUBLICATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PUBLIC_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/

function readPluginName(options: unknown) {
    if (!options || typeof options !== 'object' || !('pluginName' in options)) return undefined
    return typeof options.pluginName === 'string' && options.pluginName.trim() ? options.pluginName : undefined
}

@Injectable()
export class McpPublicationService {
    constructor(
        @InjectRepository(McpPublication)
        private readonly publicationRepository: Repository<McpPublication>,
        @InjectRepository(McpPublicationCapability)
        private readonly bindingRepository: Repository<McpPublicationCapability>,
        @InjectRepository(McpCapabilityCatalog)
        private readonly catalogRepository: Repository<McpCapabilityCatalog>,
        @InjectRepository(XpertToolset)
        private readonly toolsetRepository: Repository<XpertToolset>,
        @InjectRepository(McpApiKey)
        private readonly apiKeyRepository: Repository<McpApiKey>,
        @InjectRepository(McpOAuthPolicy)
        private readonly oauthPolicyRepository: Repository<McpOAuthPolicy>,
        @InjectRepository(McpInvocationAudit)
        private readonly auditRepository: Repository<McpInvocationAudit>,
        private readonly subscriptions: McpSubscriptionService
    ) {}

    async create(input: CreateMcpPublicationInput) {
        const scope = this.currentScope()
        this.assertNameAndSlug(input.name, input.slug)
        const authMethods: McpAuthMethod[] = input.authMethods?.length ? input.authMethods : ['api_key']
        this.assertAuthMethods(authMethods)
        await this.assertSlugAvailable(input.slug)
        const userId = RequestContext.currentUserId()

        return this.publicationRepository.save(
            this.publicationRepository.create({
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                name: input.name.trim(),
                slug: input.slug.trim(),
                status: 'draft',
                authMethods,
                instructions: input.instructions?.trim() || null,
                protocolVersion: MCP_PROTOCOL_VERSION,
                reviewStatus: 'current',
                createdById: userId,
                updatedById: userId
            })
        )
    }

    async list() {
        const scope = this.currentScope()
        const publications = await this.publicationRepository.find({
            where: {
                tenantId: scope.tenantId,
                organizationId: scope.organizationId ?? IsNull()
            },
            order: { createdAt: 'DESC' }
        })
        if (!publications.length) {
            return []
        }

        const publicationIds = publications.map(({ id }) => id)
        const [capabilityRows, apiKeyRows, oauthPolicies, auditRows] = await Promise.all([
            this.bindingRepository
                .createQueryBuilder('capability')
                .select('capability.publicationId', 'publicationId')
                .addSelect('COUNT(capability.id)', 'count')
                .where('capability.tenantId = :tenantId', { tenantId: scope.tenantId })
                .andWhere('capability.publicationId IN (:...publicationIds)', { publicationIds })
                .andWhere('capability.enabled = :enabled', { enabled: true })
                .groupBy('capability.publicationId')
                .getRawMany<{ publicationId: string; count: string }>(),
            this.apiKeyRepository
                .createQueryBuilder('apiKey')
                .select('apiKey.publicationId', 'publicationId')
                .addSelect('COUNT(apiKey.id)', 'count')
                .where('apiKey.tenantId = :tenantId', { tenantId: scope.tenantId })
                .andWhere('apiKey.publicationId IN (:...publicationIds)', { publicationIds })
                .andWhere('apiKey.revokedAt IS NULL')
                .andWhere('(apiKey.expiresAt IS NULL OR apiKey.expiresAt > CURRENT_TIMESTAMP)')
                .groupBy('apiKey.publicationId')
                .getRawMany<{ publicationId: string; count: string }>(),
            this.oauthPolicyRepository.find({
                select: { publicationId: true, enabled: true },
                where: { tenantId: scope.tenantId, publicationId: In(publicationIds) }
            }),
            this.auditRepository
                .createQueryBuilder('audit')
                .select('audit.publicationId', 'publicationId')
                .addSelect('MAX(audit.createdAt)', 'recentInvocationAt')
                .addSelect(
                    "MAX(CASE WHEN audit.status IN ('failed', 'denied') THEN audit.createdAt ELSE NULL END)",
                    'recentErrorAt'
                )
                .where('audit.tenantId = :tenantId', { tenantId: scope.tenantId })
                .andWhere('audit.publicationId IN (:...publicationIds)', { publicationIds })
                .groupBy('audit.publicationId')
                .getRawMany<{
                    publicationId: string
                    recentInvocationAt: Date | null
                    recentErrorAt: Date | null
                }>()
        ])
        const capabilityCounts = new Map(capabilityRows.map((row) => [row.publicationId, Number(row.count)]))
        const apiKeyCounts = new Map(apiKeyRows.map((row) => [row.publicationId, Number(row.count)]))
        const oauthByPublication = new Map(oauthPolicies.map((policy) => [policy.publicationId, policy.enabled]))
        const auditByPublication = new Map(auditRows.map((row) => [row.publicationId, row]))

        return publications.map((publication) => {
            const audit = auditByPublication.get(publication.id)
            return {
                ...publication,
                capabilityCount: capabilityCounts.get(publication.id) ?? 0,
                apiKeyCount: apiKeyCounts.get(publication.id) ?? 0,
                oauthEnabled: isMcpOAuthEnabled() && (oauthByPublication.get(publication.id) ?? false),
                recentInvocationAt: audit?.recentInvocationAt ?? null,
                recentErrorAt: audit?.recentErrorAt ?? null
            }
        })
    }

    async getManaged(id: string, relations?: string[]) {
        return this.findCurrentScopeById(id, relations)
    }

    async update(id: string, input: UpdateMcpPublicationInput) {
        const publication = await this.getManaged(id)
        if (input.name !== undefined) {
            this.assertNameAndSlug(input.name, publication.slug)
        }
        if (input.slug !== undefined && input.slug.trim() !== publication.slug) {
            throw new BadRequestException(
                t('server-ai:Error.McpPublicationSlugImmutable', {
                    defaultValue: 'The MCP service slug cannot be changed after creation.'
                })
            )
        }
        if (input.authMethods) {
            this.assertAuthMethods(input.authMethods)
        }
        if (input.status === 'active' || (publication.status === 'active' && input.authMethods !== undefined)) {
            await this.assertCanEnable(publication, input.authMethods ?? publication.authMethods)
        }

        Object.assign(publication, {
            ...(input.name !== undefined ? { name: input.name.trim() } : {}),
            ...(input.authMethods !== undefined ? { authMethods: input.authMethods } : {}),
            ...(input.instructions !== undefined ? { instructions: input.instructions?.trim() || null } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            updatedById: RequestContext.currentUserId()
        })
        const saved = await this.publicationRepository.save(publication)
        if (input.authMethods !== undefined || input.status === 'disabled') {
            this.subscriptions.publishAccessInvalidated(publication.id)
        }
        return saved
    }

    async enable(id: string) {
        const publication = await this.getManaged(id)
        await this.assertCanEnable(publication)
        publication.status = 'active'
        publication.updatedById = RequestContext.currentUserId()
        const saved = await this.publicationRepository.save(publication)
        const capabilities = await this.bindingRepository.find({ where: { publicationId: publication.id } })
        this.subscriptions.publishCatalogChanged(
            publication.id,
            capabilities.map((capability) => capability.capabilityType)
        )
        return saved
    }

    async disable(id: string) {
        return this.setStatus(id, 'disabled')
    }

    async remove(id: string) {
        return this.setStatus(id, 'disabled')
    }

    async availableCapabilities(id: string, toolsetId?: string) {
        const publication = await this.getManaged(id)
        const toolsets = await this.toolsetRepository.find({
            select: { id: true },
            where: {
                tenantId: publication.tenantId,
                organizationId: publication.organizationId ?? IsNull(),
                workspaceId: IsNull(),
                ...(toolsetId ? { id: toolsetId } : {})
            }
        })
        if (!toolsets.length) return []
        return this.catalogRepository.find({
            where: {
                tenantId: publication.tenantId,
                organizationId: publication.organizationId ?? IsNull(),
                toolsetId: In(toolsets.map(({ id }) => id)),
                enabled: true
            },
            order: { capabilityType: 'ASC', capabilityKey: 'ASC' }
        })
    }

    async availableCapabilitySources(id: string): Promise<IMcpCapabilitySourceSummary[]> {
        const publication = await this.getManaged(id)
        const toolsets = await this.toolsetRepository.find({
            select: { id: true, name: true, options: true },
            where: {
                tenantId: publication.tenantId,
                organizationId: publication.organizationId ?? IsNull(),
                workspaceId: IsNull()
            }
        })
        if (!toolsets.length) return []

        const query = this.catalogRepository
            .createQueryBuilder('catalog')
            .select('catalog.toolsetId', 'toolsetId')
            .addSelect('COUNT(catalog.id)', 'capabilityCount')
            .where('catalog.tenantId = :tenantId', { tenantId: publication.tenantId })
            .andWhere('catalog.toolsetId IN (:...toolsetIds)', { toolsetIds: toolsets.map(({ id }) => id) })
            .andWhere('catalog.enabled = :enabled', { enabled: true })
            .groupBy('catalog.toolsetId')

        if (publication.organizationId) {
            query.andWhere('catalog.organizationId = :organizationId', {
                organizationId: publication.organizationId
            })
        } else {
            query.andWhere('catalog.organizationId IS NULL')
        }

        const countRows = await query.getRawMany<{ toolsetId: string; capabilityCount: string }>()
        const counts = new Map(
            countRows.map(({ toolsetId, capabilityCount }) => [toolsetId, Number.parseInt(capabilityCount, 10)])
        )

        return toolsets
            .flatMap((toolset) => {
                const capabilityCount = counts.get(toolset.id)
                if (!capabilityCount) return []
                const pluginName = readPluginName(toolset.options)
                return [
                    {
                        toolsetId: toolset.id,
                        name: toolset.name,
                        ...(pluginName ? { pluginName } : {}),
                        capabilityCount
                    }
                ]
            })
            .sort((left, right) => left.name.localeCompare(right.name))
    }

    async test(id: string) {
        const publication = await this.getManaged(id, ['capabilities'])
        const capabilities = await this.resolveRuntimeCapabilities(publication)
        const capabilityCounts = capabilities.reduce<Partial<Record<McpCapabilityType, number>>>((counts, item) => {
            counts[item.capabilityType] = (counts[item.capabilityType] ?? 0) + 1
            return counts
        }, {})
        const checks: Array<{
            key: string
            status: 'passed' | 'failed' | 'warning'
            message: string
        }> = [
            {
                key: 'protocol',
                status: publication.protocolVersion === MCP_PROTOCOL_VERSION ? 'passed' : 'failed',
                message: t('server-ai:Mcp.Test.Protocol', {
                    defaultValue: 'Protocol version is {{version}}.',
                    version: publication.protocolVersion
                })
            },
            {
                key: 'capabilities',
                status: capabilities.length ? 'passed' : 'failed',
                message: capabilities.length
                    ? t('server-ai:Mcp.Test.CapabilitiesReady', {
                          defaultValue: '{{count}} enabled capabilities are ready.',
                          count: capabilities.length
                      })
                    : t('server-ai:Mcp.Test.NoCapabilities', {
                          defaultValue: 'No enabled capability is ready.'
                      })
            },
            {
                key: 'review',
                status: publication.reviewStatus === 'current' ? 'passed' : 'failed',
                message:
                    publication.reviewStatus === 'current'
                        ? t('server-ai:Mcp.Test.ReviewCurrent', {
                              defaultValue: 'Capability descriptors are current.'
                          })
                        : publication.reviewReason ||
                          t('server-ai:Mcp.Test.ReviewRequired', {
                              defaultValue: 'Capability review is required.'
                          })
            },
            {
                key: 'status',
                status: publication.status === 'active' ? 'passed' : 'warning',
                message:
                    publication.status === 'active'
                        ? t('server-ai:Mcp.Test.Active', { defaultValue: 'Publication is active.' })
                        : t('server-ai:Mcp.Test.Inactive', {
                              defaultValue: 'Publication is {{status}}; runtime requests are not accepted yet.',
                              status: publication.status
                          })
            }
        ]

        return {
            ready: checks.every((check) => check.status !== 'failed'),
            protocolVersion: publication.protocolVersion,
            status: publication.status,
            reviewStatus: publication.reviewStatus,
            enabledCapabilityCount: capabilities.length,
            capabilityCounts,
            checks
        }
    }

    async replaceCapabilities(id: string, inputs: McpCapabilityBindingInput[]) {
        const publication = await this.getManaged(id)
        const previous = await this.bindingRepository.find({ where: { publicationId: publication.id } })
        const catalog = await this.loadCatalogForBindings(publication, inputs)
        const names = new Set<string>()
        const bindings = inputs.map((input) => {
            this.assertPublicName(input.publicName)
            if (names.has(input.publicName)) {
                throw new BadRequestException(
                    t('server-ai:Error.McpDuplicatePublicName', {
                        defaultValue: `Duplicate MCP public name '${input.publicName}'.`,
                        name: input.publicName
                    })
                )
            }
            names.add(input.publicName)
            const capability = catalog.get(bindingKey(input.toolsetId, input.capabilityType, input.capabilityKey))
            if (!capability) {
                throw new BadRequestException(
                    t('server-ai:Error.McpCapabilityNotAvailable', {
                        defaultValue: `Capability '${input.capabilityKey}' is not available in this MCP scope.`,
                        key: input.capabilityKey
                    })
                )
            }
            this.assertCapabilityPolicy(capability.descriptor, input.policy)
            return this.bindingRepository.create({
                publicationId: publication.id,
                tenantId: publication.tenantId,
                organizationId: publication.organizationId ?? null,
                toolsetId: capability.toolsetId,
                capabilityType: capability.capabilityType,
                capabilityKey: capability.capabilityKey,
                publicName: input.publicName,
                enabled: input.enabled ?? true,
                policy: input.policy ?? null,
                descriptorHash: capability.descriptorHash,
                descriptorSnapshot: capability.descriptor,
                pluginVersion: capability.descriptor.source.pluginVersion ?? null,
                createdById: RequestContext.currentUserId(),
                updatedById: RequestContext.currentUserId()
            })
        })

        await this.bindingRepository.manager.transaction(async (manager) => {
            await manager.delete(McpPublicationCapability, { publicationId: publication.id })
            if (bindings.length) {
                await manager.save(McpPublicationCapability, bindings)
            }
            await manager.update(
                McpPublication,
                { id: publication.id },
                {
                    reviewStatus: 'current',
                    reviewReason: null,
                    reviewedAt: new Date(),
                    reviewedById: RequestContext.currentUserId()
                }
            )
        })
        const current = await this.bindingRepository.find({ where: { publicationId: publication.id } })
        this.subscriptions.publishCatalogChanged(
            publication.id,
            [...previous, ...current].map((binding) => binding.capabilityType)
        )
        return current
    }

    async patchCapability(id: string, capabilityId: string, input: PatchMcpCapabilityBindingInput) {
        const publication = await this.getManaged(id)
        const binding = await this.bindingRepository.findOne({
            where: { id: capabilityId, publicationId: publication.id }
        })
        if (!binding) {
            throw new NotFoundException(
                t('server-ai:Error.McpCapabilityBindingNotFound', {
                    defaultValue: 'MCP capability binding was not found.'
                })
            )
        }
        if (input.publicName !== undefined) {
            this.assertPublicName(input.publicName)
            const duplicate = await this.bindingRepository.findOne({
                where: { publicationId: publication.id, publicName: input.publicName }
            })
            if (duplicate && duplicate.id !== binding.id) {
                throw new BadRequestException(
                    t('server-ai:Error.McpDuplicatePublicName', {
                        defaultValue: `Duplicate MCP public name '${input.publicName}'.`,
                        name: input.publicName
                    })
                )
            }
            binding.publicName = input.publicName
        }
        if (input.enabled !== undefined) binding.enabled = input.enabled
        if (input.policy !== undefined) {
            this.assertCapabilityPolicy(binding.descriptorSnapshot, input.policy)
            binding.policy = input.policy
        }
        binding.updatedById = RequestContext.currentUserId()
        const saved = await this.bindingRepository.save(binding)
        this.subscriptions.publishCatalogChanged(publication.id, [saved.capabilityType])
        return saved
    }

    async findActiveBySlug(slug: string) {
        const publication = await this.publicationRepository.findOne({
            where: { slug, status: 'active' },
            relations: ['capabilities']
        })
        if (!publication) {
            throw new NotFoundException(
                t('server-ai:Error.McpPublicationNotFound', {
                    defaultValue: 'MCP Publication was not found or is disabled.'
                })
            )
        }
        return publication
    }

    async resolveRuntimeCapabilities(publication: McpPublication) {
        const bindings = (publication.capabilities ?? []).filter((binding) => binding.enabled)
        if (!bindings.length) return []
        const toolsetIds = [...new Set(bindings.map((binding) => binding.toolsetId))]
        const [catalogItems, toolsets] = await Promise.all([
            this.catalogRepository.find({
                where: {
                    tenantId: publication.tenantId,
                    organizationId: publication.organizationId ?? IsNull(),
                    toolsetId: In(toolsetIds),
                    enabled: true
                }
            }),
            this.toolsetRepository.find({
                select: { id: true },
                where: {
                    id: In(toolsetIds),
                    tenantId: publication.tenantId,
                    organizationId: publication.organizationId ?? IsNull(),
                    workspaceId: IsNull()
                }
            })
        ])
        const currentToolsetIds = new Set(toolsets.map(({ id }) => id))
        const catalog = new Map(
            catalogItems.map((item) => [bindingKey(item.toolsetId, item.capabilityType, item.capabilityKey), item])
        )
        const current: McpPublicationCapability[] = []
        const reviewReasons: string[] = []
        const changedTypes = new Set<McpCapabilityType>()
        for (const binding of bindings) {
            if (!currentToolsetIds.has(binding.toolsetId)) {
                reviewReasons.push(`${binding.publicName}: source toolset is unavailable`)
                continue
            }
            const item = catalog.get(bindingKey(binding.toolsetId, binding.capabilityType, binding.capabilityKey))
            if (!item) {
                reviewReasons.push(`${binding.publicName}: source capability is unavailable`)
                continue
            }
            if (item.descriptorHash === binding.descriptorHash) {
                current.push(binding)
                continue
            }
            const compatibility = compareMcpCapabilityDescriptors(binding.descriptorSnapshot, item.descriptor)
            if (compatibility.breaking) {
                reviewReasons.push(`${binding.publicName}: ${compatibility.reasons.join(', ')}`)
                continue
            }
            Object.assign(binding, {
                descriptorHash: item.descriptorHash,
                descriptorSnapshot: item.descriptor,
                pluginVersion: item.descriptor.source.pluginVersion ?? null
            })
            await this.bindingRepository.save(binding)
            changedTypes.add(binding.capabilityType)
            current.push(binding)
        }

        if (reviewReasons.length) {
            publication.reviewStatus = 'required'
            publication.reviewReason = reviewReasons.join('; ')
            await this.publicationRepository.update(publication.id, {
                reviewStatus: publication.reviewStatus,
                reviewReason: publication.reviewReason
            })
        }
        if (changedTypes.size) {
            this.subscriptions.publishCatalogChanged(publication.id, [...changedTypes])
        }
        return current
    }

    private async setStatus(id: string, status: McpPublicationStatus) {
        const publication = await this.getManaged(id)
        publication.status = status
        publication.updatedById = RequestContext.currentUserId()
        const saved = await this.publicationRepository.save(publication)
        const capabilities = await this.bindingRepository.find({ where: { publicationId: publication.id } })
        this.subscriptions.publishCatalogChanged(
            publication.id,
            capabilities.map((capability) => capability.capabilityType)
        )
        if (status === 'disabled') this.subscriptions.publishAccessInvalidated(publication.id)
        return saved
    }

    private async assertCanEnable(publication: McpPublication, authMethods = publication.authMethods) {
        this.assertAuthMethods(authMethods)
        if (publication.reviewStatus === 'required') {
            throw new BadRequestException(
                t('server-ai:Error.McpPublicationReviewRequired', {
                    defaultValue: 'MCP Publication requires capability review before it can be enabled.'
                })
            )
        }
        const count = await this.bindingRepository.count({
            where: { publicationId: publication.id, enabled: true }
        })
        if (!count) {
            throw new BadRequestException(
                t('server-ai:Error.McpPublicationRequiresCapability', {
                    defaultValue: 'Select at least one enabled capability before enabling this Publication.'
                })
            )
        }
        if (authMethods?.includes('oauth')) {
            const policy = await this.oauthPolicyRepository.findOne({
                where: {
                    publicationId: publication.id,
                    tenantId: publication.tenantId,
                    enabled: true
                }
            })
            if (!policy) {
                throw new BadRequestException(
                    t('server-ai:Error.McpPublicationRequiresOAuthPolicy', {
                        defaultValue: 'Configure and enable an OAuth policy before enabling OAuth for this Publication.'
                    })
                )
            }
        }
    }

    private async findCurrentScopeById(id: string, relations?: string[]) {
        const scope = this.currentScope()
        const publication = await this.publicationRepository.findOne({
            where: {
                id,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId ?? IsNull()
            },
            relations
        })
        if (!publication) {
            throw new NotFoundException(
                t('server-ai:Error.McpPublicationNotFound', {
                    defaultValue: 'MCP Publication was not found.'
                })
            )
        }
        return publication
    }

    private async loadCatalogForBindings(publication: McpPublication, inputs: McpCapabilityBindingInput[]) {
        if (!inputs.length) return new Map<string, McpCapabilityCatalog>()
        const requestedToolsetIds = [...new Set(inputs.map((input) => input.toolsetId))]
        const toolsets = await this.toolsetRepository.find({
            select: { id: true },
            where: {
                id: In(requestedToolsetIds),
                tenantId: publication.tenantId,
                organizationId: publication.organizationId ?? IsNull(),
                workspaceId: IsNull()
            }
        })
        if (!toolsets.length) return new Map<string, McpCapabilityCatalog>()
        const items = await this.catalogRepository.find({
            where: {
                tenantId: publication.tenantId,
                organizationId: publication.organizationId ?? IsNull(),
                toolsetId: In(toolsets.map(({ id }) => id)),
                enabled: true
            }
        })
        return new Map(items.map((item) => [bindingKey(item.toolsetId, item.capabilityType, item.capabilityKey), item]))
    }

    private currentScope() {
        const scope = RequestContext.getScope()
        if (!scope.tenantId) {
            throw new BadRequestException(
                t('server-ai:Error.McpManagementScopeRequired', {
                    defaultValue: 'A tenant or organization scope is required to manage MCP services.'
                })
            )
        }
        return {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId ?? null
        }
    }

    private assertNameAndSlug(name: string, slug: string) {
        if (!name?.trim() || name.trim().length > 191) {
            throw new BadRequestException(
                t('server-ai:Error.McpPublicationInvalidName', {
                    defaultValue: 'MCP Publication name is required and must not exceed 191 characters.'
                })
            )
        }
        if (!PUBLICATION_SLUG_PATTERN.test(slug?.trim()) || slug.trim().length > 191) {
            throw new BadRequestException(
                t('server-ai:Error.McpPublicationInvalidSlug', {
                    defaultValue: 'MCP Publication slug must contain lowercase letters, numbers, and hyphens only.'
                })
            )
        }
    }

    private assertPublicName(name: string) {
        if (!PUBLIC_NAME_PATTERN.test(name) || name.length > 191) {
            throw new BadRequestException(
                t('server-ai:Error.McpCapabilityInvalidPublicName', {
                    defaultValue: 'Capability public name must contain letters, numbers, underscores, and hyphens only.'
                })
            )
        }
    }

    private assertCapabilityPolicy(
        descriptor: McpPublicationCapability['descriptorSnapshot'],
        policy: McpCapabilityBindingInput['policy']
    ) {
        if (
            descriptor.capabilityType === 'tool' &&
            descriptor.behavior.risk === 'dangerous' &&
            policy?.approvalMode === 'allow'
        ) {
            throw new BadRequestException(
                t('server-ai:Error.McpDangerousToolCannotBypassApproval', {
                    defaultValue: `Dangerous tool '${descriptor.capabilityKey}' cannot bypass approval.`,
                    name: descriptor.capabilityKey
                })
            )
        }
    }

    private assertAuthMethods(methods: McpAuthMethod[]) {
        if (!methods.length || methods.some((method) => !MCP_AUTH_METHODS.includes(method))) {
            throw new BadRequestException(
                t('server-ai:Error.McpPublicationInvalidAuthMethod', {
                    defaultValue: 'MCP Publication must use a supported authentication method.'
                })
            )
        }
        if (methods.includes('oauth')) assertMcpOAuthEnabled()
    }

    private async assertSlugAvailable(slug: string, excludeId?: string) {
        const existing = await this.publicationRepository.findOne({ where: { slug } })
        if (existing && existing.id !== excludeId) {
            throw new BadRequestException(
                t('server-ai:Error.McpPublicationSlugExists', {
                    defaultValue: `MCP Publication slug '${slug}' is already in use.`,
                    slug
                })
            )
        }
    }
}

function bindingKey(toolsetId: string, capabilityType: McpCapabilityType, capabilityKey: string) {
    return `${toolsetId}:${capabilityType}:${capabilityKey}`
}
