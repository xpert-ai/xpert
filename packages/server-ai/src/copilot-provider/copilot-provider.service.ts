import { CopilotRoleDefault } from '../copilot/role-defaults/role-default.entity'
import { EnabledModelSelection, modelIdentityKey, ProviderModel } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ICopilotProvider } from '@xpert-ai/contracts'
import { Copilot } from '../copilot/copilot.entity'
import { t } from 'i18next'
import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { ConnectionDeletionService } from '../copilot/connection-deletion/connection-deletion.service'
import { InjectRepository } from '@nestjs/typeorm'
import { DeepPartial, FindManyOptions, In, IsNull, Repository } from 'typeorm'
import { pick } from 'lodash'
import { CopilotProvider } from './copilot-provider.entity'
import { CopilotProviderModel } from './models/copilot-provider-model.entity'
import { snapshotEnabledModels } from './models/enabled-models'

@Injectable()
export class CopilotProviderService extends TenantOrganizationAwareCrudService<CopilotProvider> {
    @Inject(ConnectionDeletionService)
    private readonly deletion: ConnectionDeletionService

    async delete(id: string) {
        return this.deletion.delete(id, 'provider')
    }

    async softRemove(): Promise<never> {
        return this.deletion.rejectRestore()
    }
    async softDelete(): Promise<never> {
        return this.deletion.rejectRestore()
    }
    async softRecover(): Promise<never> {
        return this.deletion.rejectRestore()
    }
    async restoreSoftDelete(): Promise<never> {
        return this.deletion.rejectRestore()
    }

    constructor(
        @InjectRepository(CopilotProvider)
        repository: Repository<CopilotProvider>
    ) {
        super(repository)
    }

    async create(input: DeepPartial<CopilotProvider>): Promise<CopilotProvider> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId() ?? null
        return this.repository.manager.transaction(async (manager) => {
            const connection =
                input.copilotId &&
                (await manager.findOne(Copilot, {
                    where: { id: input.copilotId, tenantId, organizationId: organizationId ?? IsNull() },
                    loadEagerRelations: false,
                    lock: { mode: 'pessimistic_write' }
                }))
            if (!connection) throw new BadRequestException(t('server-ai:Error.ConnectionNotFound'))
            return manager.save(CopilotProvider, {
                ...pick(input, 'providerName', 'providerType', 'credentials', 'isValid', 'options'),
                tenantId,
                organizationId,
                copilotId: connection.id,
                createdById: RequestContext.currentUserId(),
                updatedById: RequestContext.currentUserId()
            })
        })
    }

    async update(id: string, input: DeepPartial<CopilotProvider>) {
        const existing = await this.findOne(id)
        if (input.copilotId && input.copilotId !== existing.copilotId)
            throw new BadRequestException(t('server-ai:Error.ModelDefaultInvalid'))
        return this.repository.manager.transaction(async (manager) => {
            const connection = await manager.findOne(Copilot, {
                where: {
                    id: existing.copilotId,
                    tenantId: existing.tenantId,
                    organizationId: existing.organizationId ?? IsNull()
                },
                loadEagerRelations: false,
                lock: { mode: 'pessimistic_write' }
            })
            if (!connection) throw new NotFoundException(t('server-ai:Error.ConnectionNotFound'))
            const result = await manager.update(
                CopilotProvider,
                { id, tenantId: existing.tenantId, organizationId: existing.organizationId ?? IsNull() },
                {
                    ...pick(input, 'providerName', 'providerType', 'credentials', 'isValid', 'options'),
                    updatedById: RequestContext.currentUserId()
                }
            )
            if (!result.affected) throw new NotFoundException(t('server-ai:Error.ConnectionNotFound'))
            return result
        })
    }

    async assertDefaultsRemainEnabled(connection: CopilotProvider, models: EnabledModelSelection[]) {
        const defaults = await this.repository.manager
            .getRepository(CopilotRoleDefault)
            .createQueryBuilder('setting')
            .where('setting.tenantId = :tenantId', { tenantId: RequestContext.currentTenantId() })
            .andWhere("setting.mode = 'fixed' AND setting.binding ->> 'copilotId' = :id", { id: connection.copilotId })
            .getMany()
        const keys = new Set(models.map(modelIdentityKey))
        if (
            defaults.some(
                (item) => !keys.has(modelIdentityKey({ model: item.binding.model, modelType: item.binding.modelType }))
            )
        ) {
            throw new BadRequestException(t('server-ai:Error.ModelDefaultInUse'))
        }
    }

    async initializeEnabledModels(id: string, builtin: ProviderModel[]) {
        const provider = await this.findOne(id)
        await this.repository.manager.transaction(async (manager) => {
            const current = await manager.findOne(CopilotProvider, {
                where: {
                    id: provider.id,
                    tenantId: provider.tenantId,
                    organizationId: provider.organizationId ?? IsNull()
                },
                lock: { mode: 'pessimistic_write' }
            })
            if (!current || current.options?.enabledModels !== undefined) return
            const custom = await manager.find(CopilotProviderModel, {
                where: {
                    providerId: id,
                    tenantId: provider.tenantId,
                    organizationId: provider.organizationId ?? IsNull()
                }
            })
            await manager.update(CopilotProvider, id, {
                options: { ...current.options, enabledModels: snapshotEnabledModels(current, builtin, custom) }
            })
        })
    }

    async saveNamedConnection(input: Partial<ICopilotProvider>, name: string) {
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 100)
            throw new BadRequestException(t('server-ai:Error.ModelDefaultInvalid'))
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId() ?? null
        const existing = input.id ? await this.findOne(input.id) : null
        if (existing && existing.providerName !== input.providerName)
            throw new BadRequestException(t('server-ai:Error.ModelDefaultInvalid'))
        return this.repository.manager.transaction(async (manager) => {
            const connections = manager.getRepository(Copilot)
            const id = existing?.copilotId ?? input.copilotId
            const connection = id
                ? await connections.findOne({
                      where: { id, tenantId, organizationId: organizationId ?? IsNull() },
                      loadEagerRelations: false,
                      lock: { mode: 'pessimistic_write' }
                  })
                : null
            if (id && !connection) throw new BadRequestException(t('server-ai:Error.ModelDefaultInvalid'))
            const saved = await connections.save({
                ...connection,
                tenantId,
                organizationId,
                name: name.trim(),
                ...(connection ? {} : { enabled: true })
            })
            return manager.getRepository(CopilotProvider).save({
                ...existing,
                tenantId,
                organizationId,
                copilotId: saved.id,
                providerName: input.providerName,
                credentials: input.credentials,
                isValid: true,
                options: existing ? existing.options : (input.options ?? { enabledModels: [] })
            })
        })
    }

    async findVisibleByCopilotIds(
        copilotIds: string[],
        options?: {
            tenantId?: string | null
            organizationId?: string | null
            findOptions?: Omit<FindManyOptions<CopilotProvider>, 'where'>
        }
    ): Promise<Map<string, CopilotProvider>> {
        const tenantId = options?.tenantId !== undefined ? options.tenantId : RequestContext.currentTenantId()
        const organizationId =
            options?.organizationId !== undefined ? options.organizationId : RequestContext.getOrganizationId()

        if (!tenantId || !copilotIds?.length) {
            return new Map()
        }

        const items = await this.repository.find({
            ...(options?.findOptions ?? {}),
            where: organizationId
                ? [
                      {
                          tenantId,
                          organizationId,
                          copilotId: In(copilotIds)
                      },
                      {
                          tenantId,
                          organizationId: IsNull(),
                          copilotId: In(copilotIds)
                      }
                  ]
                : [
                      {
                          tenantId,
                          organizationId: IsNull(),
                          copilotId: In(copilotIds)
                      }
                  ]
        })

        const providers = new Map<string, CopilotProvider>()
        for (const item of items) {
            if (!item?.copilotId) {
                continue
            }

            const existing = providers.get(item.copilotId)
            if (!existing || (!existing.organizationId && item.organizationId)) {
                providers.set(item.copilotId, item)
            }
        }

        return providers
    }
}
