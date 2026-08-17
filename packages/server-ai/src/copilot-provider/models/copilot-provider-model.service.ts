import { ICopilotProviderModel } from '@xpert-ai/contracts'
import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { IAIModelProviderStrategy } from '@xpert-ai/plugin-sdk'
import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Not, Repository } from 'typeorm'
import { t } from 'i18next'
import { AIModelGetProviderQuery } from '../../ai-model'
import { CopilotProviderModel } from './copilot-provider-model.entity'
import { CopilotProviderService } from '../copilot-provider.service'
import { ModelAccessService } from '../../model-access'

@Injectable()
export class CopilotProviderModelService extends TenantOrganizationAwareCrudService<CopilotProviderModel> {
    constructor(
        @InjectRepository(CopilotProviderModel)
        repository: Repository<CopilotProviderModel>,
        private readonly providerService: CopilotProviderService,
        private readonly queryBus: QueryBus,
        private readonly modelAccessService: ModelAccessService
    ) {
        super(repository)
    }

    /**
     * Creates or updates a CopilotProviderModel entity.
     *
     * - When creating, model properties must be provided.
     * - Validates model credentials using the provider's model manager.
     * - If an ID is present, updates the existing entity; otherwise, creates a new one.
     *
     * @param entity - Partial data for the CopilotProviderModel to upsert.
     * @returns The created or updated CopilotProviderModel entity.
     * @throws {HttpException} If model properties are missing during creation.
     */
    async upsertModel(entity: Partial<ICopilotProviderModel>) {
        const previous = entity.id ? await this.findOne(entity.id) : null
        const modelProperties = entity.modelProperties
        const providerId = entity.providerId
        // Must provide model credentials when create custom model
        if (!entity.id && !modelProperties) {
            throw new HttpException(`Must provide model properties when create`, HttpStatus.FORBIDDEN)
        }

        if (!entity.modelName) {
            throw new HttpException(`Must provide model name when create`, HttpStatus.FORBIDDEN)
        }

        const copilotProvider = await this.providerService.findOne(providerId)

        // Model name must be unique
        let existingModel: CopilotProviderModel
        try {
            existingModel = await this.findOneByWhereOptions({
                modelName: entity.modelName,
                providerId,
                id: entity.id ? Not(entity.id) : Not(IsNull())
            })
        } catch {
            // ignore not found
        }
        if (existingModel && existingModel.id !== entity.id) {
            throw new HttpException(
                t('server-ai:Error.ModelNameExists', { modelName: entity.modelName }),
                HttpStatus.FORBIDDEN
            )
        }

        // Validate model credentials
        if (modelProperties) {
            const providerInstance = await this.queryBus.execute<AIModelGetProviderQuery, IAIModelProviderStrategy>(
                new AIModelGetProviderQuery(copilotProvider.providerName)
            )
            const modelManager = providerInstance.getModelManager(entity.modelType)
            await modelManager.validateCredentials(entity.modelName, {
                ...(copilotProvider.credentials ?? {}),
                ...(entity.modelProperties ?? {})
            })
        }

        if (entity.id) {
            await this.update(entity.id, entity)
            const saved = await this.findOne(entity.id)
            if (
                previous?.modelName &&
                previous.modelType &&
                (previous.modelName !== saved.modelName || previous.modelType !== saved.modelType)
            ) {
                await this.closePreviousModelAccess(previous, copilotProvider.copilotId)
            }
            return saved
        }
        return await this.create(entity)
    }

    async deleteModel(id: string) {
        const model = await this.findOne(id)
        const provider = await this.providerService.findOne(model.providerId)
        const result = await this.delete(id)
        await this.closePreviousModelAccess(model, provider.copilotId)
        return result
    }

    private async closePreviousModelAccess(model: CopilotProviderModel, copilotId?: string | null) {
        if (!copilotId || !model.tenantId || !model.modelName || !model.modelType) {
            return
        }
        await this.modelAccessService.handleConfiguredModelDeleted({
            tenantId: model.tenantId,
            copilotId,
            copilotModelId: model.modelName,
            modelType: model.modelType
        })
    }
}
