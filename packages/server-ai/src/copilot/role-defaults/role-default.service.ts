import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { QueryBus } from '@nestjs/cqrs'
import { IsNull, Repository } from 'typeorm'
import { t } from 'i18next'
import {
    AiModelTypeEnum,
    DefaultModelRole,
    defaultModelDefinition,
    DEFAULT_MODEL_DEFINITIONS,
    ICopilotWithProvider,
    ModelBinding,
    modelBindingSchema,
    RoleDefaultInput,
    RoleDefaultSetting,
    transitionModelParameters
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { CopilotRoleDefault } from './role-default.entity'
import { Copilot } from '../copilot.entity'
import { CopilotModelCatalogMode, FindCopilotModelsQuery } from '../queries/copilot-model-find.query'
import { CopilotProviderModelParameterRulesQuery } from '../../copilot-provider/queries/model-parameter-rules.query'
import type { ParameterRule } from '@xpert-ai/contracts'

@Injectable()
export class CopilotRoleDefaultService {
    constructor(
        @InjectRepository(CopilotRoleDefault) private readonly defaults: Repository<CopilotRoleDefault>,
        @InjectRepository(Copilot) private readonly connections: Repository<Copilot>,
        private readonly queries: QueryBus
    ) {}

    /** The sole runtime compatibility boundary for pre-assignment connection defaults. */
    async resolve(tenantId: string, organizationId: string | null, role: DefaultModelRole) {
        const resolved = await this.explicit(tenantId, organizationId, role)
        if (resolved.configured) return resolved
        const local = await this.legacy(tenantId, organizationId, role)
        if (local) return { ...resolved, binding: local }
        return {
            ...resolved,
            binding: organizationId ? await this.legacy(tenantId, null, role) : null,
            sourceOrganizationId: null
        }
    }

    /** Setup can edit an owned connection even before it has a usable model. Never edit inherited tenant credentials. */
    async setupConnection(role: DefaultModelRole) {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId() ?? null
        const own = await this.defaults.findOneBy({ tenantId, scopeKey: organizationId ?? 'tenant', role })
        if (own?.mode === 'fixed') {
            const binding = modelBindingSchema.parse(own.binding)
            const connection = await this.connections.findOne({
                where: { id: binding.copilotId, tenantId, organizationId: organizationId ?? IsNull() }
            })
            return connection ? { ...connection, copilotModel: binding } : null
        }
        const legacyRole = defaultModelDefinition(role).legacyRole
        return legacyRole
            ? this.connections.findOne({
                  where: { tenantId, organizationId: organizationId ?? IsNull(), role: legacyRole },
                  order: { createdAt: 'ASC', id: 'ASC' }
              })
            : null
    }

    async explicit(
        tenantId: string,
        organizationId: string | null,
        role: DefaultModelRole
    ): Promise<{ configured: boolean; binding: ModelBinding | null; sourceOrganizationId: string | null }> {
        const own = await this.defaults.findOneBy({ tenantId, scopeKey: organizationId ?? 'tenant', role })
        if (own && own.mode !== 'inherit') {
            return {
                configured: true,
                binding: own.mode === 'fixed' ? modelBindingSchema.parse(own.binding) : null,
                sourceOrganizationId: organizationId
            }
        }
        if (organizationId) {
            // Preserve an unmigrated organization default before consulting tenant settings.
            if (!own && (await this.legacy(tenantId, organizationId, role)))
                return { configured: false, binding: null, sourceOrganizationId: organizationId }
            const inherited = await this.defaults.findOneBy({ tenantId, scopeKey: 'tenant', role })
            if (inherited && inherited.mode !== 'inherit') {
                return {
                    configured: true,
                    binding: inherited.mode === 'fixed' ? modelBindingSchema.parse(inherited.binding) : null,
                    sourceOrganizationId: null
                }
            }
            if (own?.mode === 'inherit')
                return {
                    configured: true,
                    binding: await this.legacy(tenantId, null, role),
                    sourceOrganizationId: null
                }
        }
        return { configured: false, binding: null, sourceOrganizationId: organizationId }
    }

    private async legacy(
        tenantId: string,
        organizationId: string | null,
        role: DefaultModelRole
    ): Promise<ModelBinding | null> {
        const legacyRole = defaultModelDefinition(role).legacyRole
        if (!legacyRole) return null
        const connection = await this.connections.findOne({
            where: { tenantId, organizationId: organizationId ?? IsNull(), role: legacyRole, enabled: true },
            order: { createdAt: 'ASC', id: 'ASC' }
        })
        const model = connection?.copilotModel
        if (!model?.model || !model.modelType) return null
        const parsed = modelBindingSchema.safeParse({
            copilotId: connection.id,
            model: model.model,
            modelType: model.modelType,
            options: model.options
        })
        return parsed.success ? parsed.data : null
    }

    async list(): Promise<RoleDefaultSetting[]> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId() ?? null
        const own = await this.defaults.findBy({ tenantId, scopeKey: organizationId ?? 'tenant' })
        const catalogs = new Map<AiModelTypeEnum, ICopilotWithProvider[]>()
        const result: RoleDefaultSetting[] = []
        for (const { role } of DEFAULT_MODEL_DEFINITIONS) {
            const resolved = await this.resolve(tenantId, organizationId, role)
            const binding = resolved.binding
            const inheritedBinding = organizationId ? (await this.resolve(tenantId, null, role)).binding : null
            for (const item of [binding, inheritedBinding]) {
                if (item && !catalogs.has(item.modelType))
                    catalogs.set(item.modelType, await this.catalog(item.modelType))
            }
            const available = (item: ModelBinding | null) =>
                !!item &&
                item.modelType === defaultModelDefinition(role).modelType &&
                !!catalogs
                    .get(item.modelType)
                    ?.some(
                        (entry) =>
                            entry.id === item.copilotId &&
                            entry.providerWithModels.models.some(
                                (model) => model.model === item.model && model.model_type === item.modelType
                            )
                    )
            const connection = binding
                ? catalogs.get(binding.modelType)?.find((entry) => entry.id === binding.copilotId)
                : null
            result.push({
                role,
                mode:
                    own.find((item) => item.role === role)?.mode ??
                    (resolved.configured
                        ? 'inherit'
                        : defaultModelDefinition(role).legacyRole
                          ? 'legacy'
                          : organizationId
                            ? 'inherit'
                            : 'disabled'),
                binding,
                sourceOrganizationId: resolved.sourceOrganizationId,
                connectionName: connection?.name || connection?.modelProvider?.providerName,
                inheritedBinding,
                inheritedAvailable: available(inheritedBinding),
                available: available(binding)
            })
        }
        return result
    }

    async save(inputs: RoleDefaultInput[]) {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId() ?? null
        for (const input of inputs) {
            if (input.mode === 'inherit' && !organizationId)
                throw new BadRequestException(t('server-ai:Error.ModelDefaultInvalid'))
            if (input.mode !== 'fixed') continue
            const expected = defaultModelDefinition(input.role).modelType
            if (input.binding.modelType !== expected)
                throw new BadRequestException(t('server-ai:Error.ModelDefaultInvalid'))
            const connection = (await this.catalog(expected)).find((entry) => entry.id === input.binding.copilotId)
            if (
                !connection?.providerWithModels.models.some(
                    (model) => model.model === input.binding.model && model.model_type === expected
                )
            ) {
                throw new BadRequestException(t('server-ai:Error.ModelDefaultUnavailable'))
            }
            const rules = await this.queries.execute<CopilotProviderModelParameterRulesQuery, ParameterRule[]>(
                new CopilotProviderModelParameterRulesQuery(connection.modelProvider.id, expected, input.binding.model)
            )
            const transition = transitionModelParameters(input.binding.options, rules, 'compatible')
            if (transition.missing.length) throw new BadRequestException(t('server-ai:Error.ModelParametersRequired'))
            input.binding.options = transition.options
        }
        await this.defaults.manager.transaction(async (manager) => {
            for (const input of inputs) {
                await manager.getRepository(CopilotRoleDefault).upsert(
                    {
                        tenantId,
                        organizationId,
                        scopeKey: organizationId ?? 'tenant',
                        role: input.role,
                        mode: input.mode,
                        binding: input.mode === 'fixed' ? input.binding : null
                    },
                    ['tenantId', 'scopeKey', 'role']
                )
            }
        })
        return this.list()
    }

    private catalog(type: AiModelTypeEnum) {
        return this.queries.execute<FindCopilotModelsQuery, ICopilotWithProvider[]>(
            new FindCopilotModelsQuery(type, CopilotModelCatalogMode.Management)
        )
    }
}
