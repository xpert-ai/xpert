import {
    AssistantBindingScope,
    AssistantBindingSourceScope,
    AssistantCode,
    IAssistantBinding,
    IAssistantBindingConversationPreferences,
    IAssistantBindingToolPreferences,
    IAssistantBindingUserPreference,
    IAssistantBindingUserPreferenceUpsertInput,
    IAssistantBindingUpsertInput,
    IResolvedAssistantBinding,
    RolesEnum,
    XpertTypeEnum,
    normalizeAssistantBindingToolPreferences,
    isSystemManagedAssistant,
    isUserManagedAssistant
} from '@xpert-ai/contracts'
import { RequestContext, TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { BadRequestException, ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, DeepPartial, FindOptionsWhere, In, IsNull, Not, Repository } from 'typeorm'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { Xpert } from '../xpert/xpert.entity'
import { AssistantBinding } from './assistant-binding.entity'
import { AssistantBindingUserPreference } from './assistant-binding-user-preference.entity'

type SystemScope = AssistantBindingScope.TENANT | AssistantBindingScope.ORGANIZATION
type ScopeContext = {
    tenantId: string
    organizationId?: string | null
    userId?: string | null
}
type LegacyAssistantConfigRow = {
    tenantId: string
    organizationId: string | null
    code: AssistantCode
    enabled: boolean | null
    options?: {
        assistantId?: string | null
    } | null
}
type LegacyAssistantUserPreferenceRow = {
    tenantId: string
    organizationId: string | null
    userId: string | null
    code: AssistantCode
    assistantId: string | null
}

const SYSTEM_ASSISTANT_CODES: AssistantCode[] = [
    AssistantCode.CHAT_COMMON,
    AssistantCode.XPERT_SHARED,
    AssistantCode.CHATBI
]

@Injectable()
export class AssistantBindingService
    extends TenantOrganizationAwareCrudService<AssistantBinding>
    implements OnModuleInit
{
    constructor(
        @InjectRepository(AssistantBinding)
        repository: Repository<AssistantBinding>,
        @InjectRepository(AssistantBindingUserPreference)
        private readonly preferenceRepository: Repository<AssistantBindingUserPreference>,
        @InjectRepository(Xpert)
        private readonly xpertRepository: Repository<Xpert>,
        private readonly dataSource: DataSource,
        private readonly publishedXpertAccessService: PublishedXpertAccessService
    ) {
        super(repository)
    }

    async onModuleInit() {
        await this.backfillLegacyBindings()
    }

    async getScopedBindings(scope: AssistantBindingScope) {
        this.ensureSystemScope(scope)
        this.ensureSystemReadAccess(scope)

        const tenantId = this.requireTenantId()
        const organizationId = scope === AssistantBindingScope.ORGANIZATION ? RequestContext.getOrganizationId() : null

        if (scope === AssistantBindingScope.ORGANIZATION && !organizationId) {
            return []
        }

        return this.repository.find({
            where: this.systemListWhere(scope, tenantId, organizationId),
            order: {
                code: 'ASC'
            }
        })
    }

    async getBinding(code: AssistantCode, scope: AssistantBindingScope) {
        if (scope === AssistantBindingScope.USER) {
            this.ensureUserManagedCode(code)
            const { tenantId, organizationId, userId } = this.requireUserScope()

            return this.repository.findOne({
                where: {
                    tenantId,
                    organizationId,
                    userId,
                    scope,
                    code
                }
            })
        }

        this.ensureSystemScope(scope)
        this.ensureSystemManagedCode(code)
        this.ensureSystemReadAccess(scope)

        const context = this.resolveSystemScopeContext(scope, false)
        if (!context.organizationId && scope === AssistantBindingScope.ORGANIZATION) {
            return null
        }

        return this.findBinding(code, scope, context)
    }

    async getBindingPreference(code: AssistantCode, scope: AssistantBindingScope) {
        this.ensureUserPreferenceScope(scope)
        this.ensureUserManagedCode(code)

        const binding = await this.getBinding(code, scope)
        if (!binding?.id) {
            return null
        }

        const { tenantId, organizationId, userId } = this.requireUserScope()

        return this.preferenceRepository.findOne({
            where: {
                tenantId,
                organizationId,
                assistantBindingId: binding.id,
                userId
            }
        })
    }

    async getUserPreferenceByAssistantId(assistantId: string): Promise<IAssistantBindingUserPreference | null> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = this.resolveRequestedUserOrganizationId()
        const userId = RequestContext.currentUserId()
        const normalizedAssistantId = assistantId?.trim()

        if (!tenantId || !organizationId || !userId || !normalizedAssistantId) {
            return null
        }

        const binding = await this.repository.findOne({
            where: {
                tenantId,
                organizationId,
                userId,
                scope: AssistantBindingScope.USER,
                code: AssistantCode.CLAWXPERT,
                assistantId: normalizedAssistantId
            }
        })

        if (!binding?.id) {
            return null
        }

        return this.preferenceRepository.findOne({
            where: {
                tenantId,
                organizationId,
                assistantBindingId: binding.id,
                userId
            }
        })
    }

    async getEffectiveBinding(code: AssistantCode): Promise<IResolvedAssistantBinding> {
        this.ensureSystemManagedCode(code)

        const tenantId = this.requireTenantId()
        const organizationId = RequestContext.getOrganizationId()

        if (organizationId) {
            const organizationBinding = await this.findBinding(code, AssistantBindingScope.ORGANIZATION, {
                tenantId,
                organizationId
            })
            if (organizationBinding) {
                return this.toResolvedBinding(organizationBinding, AssistantBindingSourceScope.ORGANIZATION)
            }
        }

        const tenantBinding = await this.findBinding(code, AssistantBindingScope.TENANT, {
            tenantId,
            organizationId: null
        })
        if (tenantBinding) {
            return this.toResolvedBinding(tenantBinding, AssistantBindingSourceScope.TENANT)
        }

        return {
            code,
            scope: organizationId ? AssistantBindingScope.ORGANIZATION : AssistantBindingScope.TENANT,
            assistantId: null,
            enabled: false,
            tenantId,
            organizationId: organizationId ?? null,
            userId: null,
            sourceScope: AssistantBindingSourceScope.NONE
        }
    }

    async isEffectiveSystemAssistantId(assistantId: string): Promise<boolean> {
        const normalizedAssistantId = assistantId?.trim()

        if (!normalizedAssistantId) {
            return false
        }

        for (const code of SYSTEM_ASSISTANT_CODES) {
            const binding = await this.getEffectiveBinding(code)

            if (
                binding.enabled &&
                binding.sourceScope !== AssistantBindingSourceScope.NONE &&
                binding.assistantId === normalizedAssistantId
            ) {
                return true
            }
        }

        return false
    }

    async getAvailableXperts(scope: AssistantBindingScope, code: AssistantCode) {
        if (scope === AssistantBindingScope.USER) {
            this.ensureUserManagedCode(code)
            this.requireUserScope()

            return this.publishedXpertAccessService.findAccessiblePublishedXperts({
                where: {
                    type: XpertTypeEnum.Agent,
                    latest: true
                },
                order: {
                    createdAt: 'DESC'
                }
            })
        }

        this.ensureSystemScope(scope)
        this.ensureSystemManagedCode(code)
        this.ensureSystemReadAccess(scope)

        const where = this.buildSystemXpertWhere(scope)
        if (!where) {
            return []
        }

        return this.xpertRepository.find({
            where,
            order: {
                createdAt: 'DESC'
            }
        })
    }

    async upsertBinding(input: IAssistantBindingUpsertInput) {
        const assistantId = input.assistantId?.trim()

        if (!assistantId) {
            throw new BadRequestException('assistantId is required.')
        }

        if (input.scope === AssistantBindingScope.USER) {
            this.ensureUserManagedCode(input.code)
            const { tenantId, organizationId, userId } = this.requireUserScope()
            const xpert = await this.publishedXpertAccessService.getAccessiblePublishedXpert(assistantId)

            if (xpert.type !== XpertTypeEnum.Agent || xpert.latest !== true) {
                throw new BadRequestException('Selected assistant Xpert is not available.')
            }

            const existing = await this.findBinding(input.code, input.scope, {
                tenantId,
                organizationId,
                userId
            })

            return this.saveBinding(
                existing,
                {
                    code: input.code,
                    scope: input.scope,
                    assistantId,
                    enabled: null,
                    tenantId,
                    organizationId,
                    userId
                },
                true
            )
        }

        this.ensureSystemScope(input.scope)
        this.ensureSystemManagedCode(input.code)
        this.ensureSystemWriteAccess(input.scope)

        if (typeof input.enabled !== 'boolean') {
            throw new BadRequestException('enabled is required for system assistant bindings.')
        }

        await this.ensureSystemAssistantSelectionAllowed(input.scope, assistantId)

        const context = this.resolveSystemScopeContext(input.scope, true)
        const existing = await this.findBinding(input.code, input.scope, context)

        return this.saveBinding(
            existing,
            {
                code: input.code,
                scope: input.scope,
                assistantId,
                enabled: input.enabled,
                tenantId: context.tenantId,
                organizationId: context.organizationId ?? null,
                userId: null
            },
            false
        )
    }

    async upsertBindingPreference(
        code: AssistantCode,
        input: IAssistantBindingUserPreferenceUpsertInput
    ): Promise<IAssistantBindingUserPreference> {
        this.ensureUserPreferenceScope(input.scope)
        this.ensureUserManagedCode(code)

        const { tenantId, organizationId, userId } = this.requireUserScope()
        const binding = await this.findBinding(code, input.scope, {
            tenantId,
            organizationId,
            userId
        })

        if (!binding?.id) {
            throw new BadRequestException('Assistant binding is required before user preferences can be saved.')
        }

        const currentUserId = RequestContext.currentUserId()
        const existing = await this.preferenceRepository.findOne({
            where: {
                tenantId,
                organizationId,
                assistantBindingId: binding.id,
                userId
            }
        })

        if (existing) {
            if (hasOwnPreferenceField(input, 'soul')) {
                existing.soul = normalizeMarkdownValue(input.soul)
            }
            if (hasOwnPreferenceField(input, 'profile')) {
                existing.profile = normalizeMarkdownValue(input.profile)
            }
            if (hasOwnPreferenceField(input, 'toolPreferences')) {
                existing.toolPreferences = normalizeToolPreferencesValue(input.toolPreferences)
            }
            if (hasOwnPreferenceField(input, 'conversationPreferences')) {
                existing.conversationPreferences = normalizeConversationPreferencesValue(input.conversationPreferences)
            }
            existing.updatedBy = currentUserId ? ({ id: currentUserId } as any) : existing.updatedBy
            return this.preferenceRepository.save(existing)
        }

        const entity = this.preferenceRepository.create({
            tenant: { id: tenantId },
            tenantId,
            organization: organizationId ? ({ id: organizationId } as any) : null,
            organizationId,
            assistantBinding: binding as AssistantBinding,
            assistantBindingId: binding.id,
            user: userId ? ({ id: userId } as any) : null,
            userId,
            soul: hasOwnPreferenceField(input, 'soul') ? normalizeMarkdownValue(input.soul) : undefined,
            profile: hasOwnPreferenceField(input, 'profile') ? normalizeMarkdownValue(input.profile) : undefined,
            toolPreferences: hasOwnPreferenceField(input, 'toolPreferences')
                ? normalizeToolPreferencesValue(input.toolPreferences)
                : undefined,
            conversationPreferences: hasOwnPreferenceField(input, 'conversationPreferences')
                ? normalizeConversationPreferencesValue(input.conversationPreferences)
                : undefined,
            createdBy: currentUserId ? ({ id: currentUserId } as any) : undefined,
            updatedBy: currentUserId ? ({ id: currentUserId } as any) : undefined
        } as DeepPartial<AssistantBindingUserPreference>)

        return this.preferenceRepository.save(entity)
    }

    async deleteBinding(code: AssistantCode, scope: AssistantBindingScope) {
        if (scope === AssistantBindingScope.USER) {
            this.ensureUserManagedCode(code)
            const { tenantId, organizationId, userId } = this.requireUserScope()

            return this.repository.delete({
                tenantId,
                organizationId,
                userId,
                scope,
                code
            })
        }

        this.ensureSystemScope(scope)
        this.ensureSystemManagedCode(code)
        this.ensureSystemWriteAccess(scope)

        const context = this.resolveSystemScopeContext(scope, true)

        return this.repository.delete(this.explicitWhere(code, scope, context))
    }

    private async backfillLegacyBindings() {
        await this.backfillLegacySystemBindings()
        await this.backfillLegacyUserBindings()
    }

    private async backfillLegacySystemBindings() {
        if (!(await this.tableExists('assistant_config'))) {
            return
        }

        const rows = (await this.dataSource.query(`
      SELECT
        "tenantId" as "tenantId",
        "organizationId" as "organizationId",
        code,
        enabled,
        options
      FROM assistant_config
    `)) as LegacyAssistantConfigRow[]

        for (const row of rows) {
            if (!isSystemManagedAssistant(row.code)) {
                continue
            }

            const assistantId = row.options?.assistantId?.trim()
            if (!assistantId) {
                continue
            }

            const scope = row.organizationId ? AssistantBindingScope.ORGANIZATION : AssistantBindingScope.TENANT
            const existing = await this.findBinding(row.code, scope, {
                tenantId: row.tenantId,
                organizationId: row.organizationId ?? null
            })

            if (existing) {
                continue
            }

            const entity = this.repository.create({
                code: row.code,
                scope,
                assistantId,
                enabled: row.enabled ?? true,
                tenant: { id: row.tenantId },
                tenantId: row.tenantId,
                organization: row.organizationId ? ({ id: row.organizationId } as any) : null,
                organizationId: row.organizationId ?? null
            } as DeepPartial<AssistantBinding>)

            await this.repository.save(entity)
        }
    }

    private async backfillLegacyUserBindings() {
        if (!(await this.tableExists('assistant_user_preference'))) {
            return
        }

        const rows = (await this.dataSource.query(`
      SELECT
        "tenantId" as "tenantId",
        "organizationId" as "organizationId",
        "userId" as "userId",
        code,
        "assistantId" as "assistantId"
      FROM assistant_user_preference
    `)) as LegacyAssistantUserPreferenceRow[]

        for (const row of rows) {
            if (!isUserManagedAssistant(row.code) || !row.organizationId || !row.userId) {
                continue
            }

            const assistantId = row.assistantId?.trim()
            if (!assistantId) {
                continue
            }

            const existing = await this.findBinding(row.code, AssistantBindingScope.USER, {
                tenantId: row.tenantId,
                organizationId: row.organizationId,
                userId: row.userId
            })

            if (existing) {
                continue
            }

            const entity = this.repository.create({
                code: row.code,
                scope: AssistantBindingScope.USER,
                assistantId,
                enabled: null,
                tenant: { id: row.tenantId },
                tenantId: row.tenantId,
                organization: { id: row.organizationId } as any,
                organizationId: row.organizationId,
                user: { id: row.userId } as any,
                userId: row.userId
            } as DeepPartial<AssistantBinding>)

            await this.repository.save(entity)
        }
    }

    private async tableExists(tableName: string) {
        const result = (await this.dataSource.query(`SELECT to_regclass($1) as "name"`, [
            `public.${tableName}`
        ])) as Array<{ name: string | null }>

        return !!result[0]?.name
    }

    private async saveBinding(existing: AssistantBinding | null, input: IAssistantBinding, userScoped: boolean) {
        const currentUserId = RequestContext.currentUserId()

        if (existing) {
            existing.assistantId = input.assistantId ?? null
            existing.enabled = userScoped ? null : (input.enabled ?? null)
            existing.updatedBy = currentUserId ? ({ id: currentUserId } as any) : existing.updatedBy
            return this.repository.save(existing)
        }

        const entity = this.repository.create({
            code: input.code,
            scope: input.scope,
            assistantId: input.assistantId ?? null,
            enabled: userScoped ? null : (input.enabled ?? null),
            tenant: { id: input.tenantId },
            tenantId: input.tenantId,
            organization: input.organizationId ? ({ id: input.organizationId } as any) : null,
            organizationId: input.organizationId ?? null,
            user: input.userId ? ({ id: input.userId } as any) : null,
            userId: input.userId ?? null,
            createdBy: currentUserId ? ({ id: currentUserId } as any) : undefined,
            updatedBy: currentUserId ? ({ id: currentUserId } as any) : undefined
        } as DeepPartial<AssistantBinding>)

        return this.repository.save(entity)
    }

    private async findBinding(code: AssistantCode, scope: AssistantBindingScope, context: ScopeContext) {
        return this.repository.findOne({
            where: this.explicitWhere(code, scope, context)
        })
    }

    private explicitWhere(code: AssistantCode, scope: AssistantBindingScope, context: ScopeContext) {
        const where: FindOptionsWhere<AssistantBinding> = {
            tenantId: context.tenantId,
            scope,
            code
        }

        if (scope === AssistantBindingScope.TENANT) {
            where.organizationId = IsNull()
            where.userId = IsNull()
            return where
        }

        if (scope === AssistantBindingScope.ORGANIZATION) {
            where.organizationId = context.organizationId ?? IsNull()
            where.userId = IsNull()
            return where
        }

        where.organizationId = context.organizationId!
        where.userId = context.userId!
        return where
    }

    private systemListWhere(scope: SystemScope, tenantId: string, organizationId?: string | null) {
        const where: FindOptionsWhere<AssistantBinding> = {
            tenantId,
            scope,
            code: In(SYSTEM_ASSISTANT_CODES),
            userId: IsNull()
        }

        if (scope === AssistantBindingScope.TENANT) {
            where.organizationId = IsNull()
        } else {
            where.organizationId = organizationId!
        }

        return where
    }

    private async ensureSystemAssistantSelectionAllowed(scope: SystemScope, assistantId: string) {
        const where = this.withAssistantId(this.buildSystemXpertWhere(scope), assistantId)
        if (!where) {
            throw new BadRequestException('Organization scope is required for organization assistant bindings.')
        }

        const xpert = await this.xpertRepository.findOne({ where })
        if (!xpert) {
            throw new BadRequestException('Selected assistant Xpert is not available in this binding scope.')
        }
    }

    private buildSystemXpertWhere(scope: SystemScope): FindOptionsWhere<Xpert> | FindOptionsWhere<Xpert>[] | null {
        const tenantId = this.requireTenantId()
        const organizationId = scope === AssistantBindingScope.ORGANIZATION ? RequestContext.getOrganizationId() : null
        const baseWhere = {
            tenantId,
            type: XpertTypeEnum.Agent,
            latest: true,
            publishAt: Not(IsNull())
        } as FindOptionsWhere<Xpert>

        if (scope === AssistantBindingScope.TENANT) {
            return {
                ...baseWhere,
                organizationId: IsNull()
            }
        }

        if (!organizationId) {
            return null
        }

        return [
            {
                ...baseWhere,
                organizationId: IsNull()
            },
            {
                ...baseWhere,
                organizationId
            }
        ]
    }

    private withAssistantId(
        where: FindOptionsWhere<Xpert> | FindOptionsWhere<Xpert>[] | null,
        assistantId: string
    ): FindOptionsWhere<Xpert> | FindOptionsWhere<Xpert>[] | null {
        if (!where) {
            return null
        }

        if (Array.isArray(where)) {
            return where.map((item) => ({
                ...item,
                id: assistantId
            }))
        }

        return {
            ...where,
            id: assistantId
        }
    }

    private ensureSystemManagedCode(code: AssistantCode) {
        if (!isSystemManagedAssistant(code)) {
            throw new BadRequestException('Unsupported system assistant binding code.')
        }
    }

    private ensureUserManagedCode(code: AssistantCode) {
        if (!isUserManagedAssistant(code)) {
            throw new BadRequestException('Unsupported user assistant binding code.')
        }
    }

    private ensureSystemScope(scope: AssistantBindingScope): asserts scope is SystemScope {
        if (scope !== AssistantBindingScope.TENANT && scope !== AssistantBindingScope.ORGANIZATION) {
            throw new BadRequestException('System assistant bindings only support tenant or organization scope.')
        }
    }

    private ensureSystemReadAccess(scope: SystemScope) {
        if (scope === AssistantBindingScope.TENANT) {
            if (!RequestContext.hasRole(RolesEnum.SUPER_ADMIN)) {
                throw new ForbiddenException('Tenant assistant bindings require super admin access.')
            }
            return
        }

        if (!RequestContext.hasRoles([RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN])) {
            throw new ForbiddenException('Organization assistant bindings require admin access.')
        }
    }

    private ensureSystemWriteAccess(scope: SystemScope) {
        this.ensureSystemReadAccess(scope)
    }

    private requireTenantId() {
        const tenantId = RequestContext.currentTenantId()
        if (!tenantId) {
            throw new BadRequestException('Tenant context is required.')
        }
        return tenantId
    }

    private requireUserScope() {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = this.resolveRequestedUserOrganizationId()
        const userId = RequestContext.currentUserId()

        if (!tenantId) {
            throw new BadRequestException('Tenant context is required.')
        }
        if (!organizationId) {
            throw new BadRequestException('Organization context is required.')
        }
        if (!userId) {
            throw new BadRequestException('User context is required.')
        }

        return {
            tenantId,
            organizationId,
            userId
        }
    }

    private resolveRequestedUserOrganizationId() {
        return RequestContext.currentApiPrincipal()?.requestedOrganizationId ?? RequestContext.getOrganizationId()
    }

    private resolveSystemScopeContext(scope: SystemScope, requireOrganization: boolean): ScopeContext {
        const tenantId = this.requireTenantId()

        if (scope === AssistantBindingScope.TENANT) {
            return {
                tenantId,
                organizationId: null
            }
        }

        const organizationId = requireOrganization
            ? RequestContext.requireOrganizationScope()
            : RequestContext.getOrganizationId()
        return {
            tenantId,
            organizationId: organizationId ?? null
        }
    }

    private toResolvedBinding(
        binding: AssistantBinding,
        sourceScope: AssistantBindingSourceScope
    ): IResolvedAssistantBinding {
        return {
            id: binding.id,
            code: binding.code,
            scope: binding.scope,
            assistantId: binding.assistantId ?? null,
            enabled: binding.enabled ?? null,
            tenantId: binding.tenantId,
            organizationId: binding.organizationId ?? null,
            userId: binding.userId ?? null,
            createdAt: binding.createdAt,
            updatedAt: binding.updatedAt,
            createdById: binding.createdById,
            updatedById: binding.updatedById,
            sourceScope
        }
    }

    private ensureUserPreferenceScope(scope: AssistantBindingScope) {
        if (scope !== AssistantBindingScope.USER) {
            throw new BadRequestException('User preferences only support user scope.')
        }
    }
}

function normalizeMarkdownValue(value?: string | null) {
    return value ?? null
}

function hasOwnPreferenceField<T extends object>(value: T, key: keyof T) {
    return Object.prototype.hasOwnProperty.call(value, key)
}

function normalizeToolPreferencesValue(
    value?: IAssistantBindingToolPreferences | null
): IAssistantBindingToolPreferences | null {
    return normalizeAssistantBindingToolPreferences(value)
}

function normalizeConversationPreferencesValue(
    value?: IAssistantBindingConversationPreferences | null
): IAssistantBindingConversationPreferences | null {
    if (!value) {
        return null
    }

    const defaultThreadId = normalizePreferenceThreadId(value.defaultThreadId)
    const lastThreadId = normalizePreferenceThreadId(value.lastThreadId)
    const defaultFollowUpBehavior = normalizeFollowUpBehavior(value.defaultFollowUpBehavior)

    if (defaultThreadId == null && lastThreadId == null && defaultFollowUpBehavior === undefined) {
        return null
    }

    return {
        version: 2,
        ...(defaultThreadId !== undefined ? { defaultThreadId } : {}),
        ...(lastThreadId !== undefined ? { lastThreadId } : {}),
        ...(defaultFollowUpBehavior !== undefined ? { defaultFollowUpBehavior } : {})
    }
}

function normalizeFollowUpBehavior(value?: 'queue' | 'steer' | null): 'queue' | 'steer' | undefined {
    if (value === undefined || value === null) {
        return undefined
    }

    return value === 'steer' ? 'steer' : 'queue'
}

function normalizePreferenceThreadId(value?: string | null): string | null | undefined {
    if (value === undefined) {
        return undefined
    }

    const normalized = value?.trim()
    return normalized || null
}
