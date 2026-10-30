import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { AiModelTypeEnum, isConfiguredModelAvailable, usesConfiguredModelCatalog } from '@xpert-ai/contracts'
import { EntityManager, In, Repository } from 'typeorm'
import { AIProvidersService } from '../../ai-model'
import { CopilotProviderModel } from '../../copilot-provider/models/copilot-provider-model.entity'
import { Copilot } from '../../copilot/copilot.entity'
import { CopilotWithProviderDto } from '../../copilot/dto'
import { CopilotModelCatalogMode, FindCopilotModelsQuery } from '../../copilot/queries/copilot-model-find.query'
import { ModelGatewayPublication } from '../../model-gateway/model-gateway-publication.entity'
import { ModelAccessRequest } from '../model-access-request.entity'
import { ModelTarget, ResolveModelInput } from '../model-access.types'

import { isUniqueViolation, modelKey, requireTenant, translate } from '../model-access.utils'
import { automaticExternalModelId, createModelTarget, publicationSourceKey } from './model-target.utils'

@Injectable()
export class ModelAccessTargetsService {
    constructor(
        private readonly queryBus: QueryBus,
        @InjectRepository(Copilot)
        private readonly copilotRepository: Repository<Copilot>,
        @InjectRepository(CopilotProviderModel)
        private readonly providerModelRepository: Repository<CopilotProviderModel>,
        private readonly providersService: AIProvidersService,
        @InjectRepository(ModelGatewayPublication)
        private readonly publicationRepository: Repository<ModelGatewayPublication>
    ) {}

    async loadVisibleCatalogTargets(organizationId: string | null): Promise<ModelTarget[]> {
        const tenantId = requireTenant()
        const catalogs = await Promise.all(
            Object.values(AiModelTypeEnum).map(async (modelType) => {
                const [available, management] = await Promise.all([
                    this.queryBus.execute<FindCopilotModelsQuery, CopilotWithProviderDto[]>(
                        new FindCopilotModelsQuery(modelType, CopilotModelCatalogMode.Available)
                    ),
                    this.queryBus.execute<FindCopilotModelsQuery, CopilotWithProviderDto[]>(
                        new FindCopilotModelsQuery(modelType, CopilotModelCatalogMode.Management)
                    )
                ])
                return { available, management }
            })
        )
        const targets = new Map<string, ModelTarget>()
        const addTargets = async (catalog: CopilotWithProviderDto[], listedForRequest: boolean) => {
            for (const copilot of catalog) {
                const copilotId = copilot.id
                const copilotOrganizationId = copilot.organizationId ?? null
                if (!copilotId || (copilotOrganizationId && copilotOrganizationId !== organizationId)) {
                    continue
                }
                for (const model of copilot.providerWithModels?.models ?? []) {
                    const target = await this.loadTarget(
                        {
                            tenantId,
                            copilotId,
                            copilotModelId: model.model,
                            modelType: model.model_type
                        },
                        organizationId
                    )
                    if (!target) {
                        continue
                    }
                    const key = modelKey(target)
                    targets.set(key, {
                        ...target,
                        listedForRequest: listedForRequest || targets.get(key)?.listedForRequest === true
                    })
                }
            }
        }
        for (const catalog of catalogs) {
            await addTargets(catalog.available, false)
            await addTargets(catalog.management, true)
        }
        return Array.from(targets.values())
    }

    async loadTargets(
        inputs: Array<Pick<ResolveModelInput, 'tenantId' | 'copilotId' | 'copilotModelId' | 'modelType'>>,
        visibleOrganizationId: string | null
    ): Promise<Array<ModelTarget | null>> {
        if (!inputs.length) {
            return []
        }
        const tenantId = inputs[0].tenantId
        const copilots = await this.copilotRepository.find({
            where: {
                tenantId,
                id: In(Array.from(new Set(inputs.map((input) => input.copilotId))))
            },
            relations: ['modelProvider']
        })
        const copilotById = new Map(copilots.map((copilot) => [copilot.id, copilot]))
        const providerIds = Array.from(
            new Set(copilots.map((copilot) => copilot.modelProvider?.id).filter((id): id is string => !!id))
        )
        const customModels = providerIds.length
            ? await this.providerModelRepository.find({
                  where: {
                      tenantId,
                      providerId: In(providerIds),
                      modelType: In(Array.from(new Set(inputs.map((input) => input.modelType)))),
                      modelName: In(Array.from(new Set(inputs.map((input) => input.copilotModelId))))
                  }
              })
            : []
        const customByModel = new Map(
            customModels.map((model) => [`${model.providerId}:${model.modelType}:${model.modelName}`, model])
        )

        return inputs.map((input) => {
            const copilot = copilotById.get(input.copilotId)
            if (!copilot?.modelProvider?.providerName) {
                return null
            }
            const organizationId = copilot.organizationId ?? null
            const provider = this.providersService.getProvider(
                copilot.modelProvider.providerName,
                false,
                organizationId ?? undefined
            )
            const custom = customByModel.get(`${copilot.modelProvider.id}:${input.modelType}:${input.copilotModelId}`)
            return createModelTarget(input, copilot, provider, custom, visibleOrganizationId)
        })
    }

    async loadTarget(
        input: Pick<ResolveModelInput, 'tenantId' | 'copilotId' | 'copilotModelId' | 'modelType'>,
        visibleOrganizationId?: string | null
    ): Promise<ModelTarget | null> {
        const copilot = await this.copilotRepository.findOne({
            where: {
                tenantId: input.tenantId,
                id: input.copilotId
            },
            relations: ['modelProvider']
        })
        if (!copilot?.modelProvider?.providerName) {
            return null
        }
        const organizationId = copilot.organizationId ?? null
        const provider = this.providersService.getProvider(
            copilot.modelProvider.providerName,
            false,
            organizationId ?? undefined
        )
        if (!provider) {
            return null
        }
        const custom = await this.providerModelRepository.findOne({
            where: {
                tenantId: input.tenantId,
                providerId: copilot.modelProvider.id,
                modelType: input.modelType,
                modelName: input.copilotModelId
            }
        })
        return createModelTarget(input, copilot, provider, custom, visibleOrganizationId ?? null)
    }

    async ensureAutomaticPublications(targets: ModelTarget[], manager?: EntityManager, attempt = 0) {
        if (!targets.length) {
            return []
        }
        const tenantId = targets[0].tenantId
        const repository = manager?.getRepository(ModelGatewayPublication) ?? this.publicationRepository
        const existing = await repository.find({ where: { tenantId } })
        const bySource = new Map(existing.map((publication) => [publicationSourceKey(publication), publication]))
        const usedExternalModelIds = new Set(existing.map((publication) => publication.externalModelId))
        const changed: ModelGatewayPublication[] = []
        const publications = targets.map((target) => {
            const sourceKey = publicationSourceKey(target)
            let publication = bySource.get(sourceKey)
            if (!publication) {
                publication = repository.create({
                    tenantId,
                    organizationId: target.organizationId,
                    copilotId: target.copilotId,
                    copilotModelId: target.copilotModelId,
                    provider: target.provider,
                    modelType: target.modelType,
                    model: target.model,
                    externalModelId: automaticExternalModelId(target, usedExternalModelIds),
                    capabilities: target.capabilities
                })
                bySource.set(sourceKey, publication)
                usedExternalModelIds.add(publication.externalModelId)
                changed.push(publication)
                return publication
            }

            const capabilitiesChanged =
                publication.capabilities.length !== target.capabilities.length ||
                publication.capabilities.some((capability, index) => capability !== target.capabilities[index])
            if (
                publication.provider !== target.provider ||
                publication.model !== target.model ||
                (publication.organizationId ?? null) !== target.organizationId ||
                capabilitiesChanged
            ) {
                publication.organizationId = target.organizationId
                publication.provider = target.provider
                publication.model = target.model
                publication.capabilities = target.capabilities
                changed.push(publication)
            }
            return publication
        })
        if (changed.length) {
            try {
                await repository.save(changed)
            } catch (error) {
                if (!manager && attempt < 2 && isUniqueViolation(error)) {
                    return this.ensureAutomaticPublications(targets, undefined, attempt + 1)
                }
                throw error
            }
        }
        return publications
    }

    async requireVisibleEnabledTarget(
        input: Pick<ResolveModelInput, 'tenantId' | 'organizationId' | 'copilotId' | 'copilotModelId' | 'modelType'>
    ) {
        const target = await this.loadTarget(input, input.organizationId)
        if (!target) {
            throw new NotFoundException(
                translate('server-ai:Error.ModelAccessModelNotFound', 'The requested model is not available.')
            )
        }
        if (!target.enabled) {
            throw new BadRequestException(
                translate('server-ai:Error.ModelAccessModelDisabled', 'The model is currently disabled.')
            )
        }
        return target
    }

    async targetFromRequest(request: ModelAccessRequest) {
        return this.loadTarget(
            {
                tenantId: request.tenantId,
                copilotId: request.copilotId,
                copilotModelId: request.copilotModelId,
                modelType: request.modelType
            },
            request.organizationId ?? null
        )
    }

    async hasOrganizationModelCredentials(
        input: Pick<ResolveModelInput, 'tenantId' | 'organizationId' | 'copilotId' | 'copilotModelId' | 'modelType'>
    ): Promise<boolean> {
        const target = await this.loadTarget(input, input.organizationId)
        return target?.enabled === true && target.usesOrganizationCredentials
    }

    async hasConfiguredOrganizationModels(tenantId: string, organizationId: string): Promise<boolean> {
        const copilots = await this.copilotRepository.find({
            where: {
                tenantId,
                organizationId,
                enabled: true
            },
            relations: ['modelProvider']
        })

        for (const copilot of copilots) {
            const modelProvider = copilot.modelProvider
            if (!modelProvider?.id || !modelProvider.providerName || modelProvider.isValid === false) {
                continue
            }

            const provider = this.providersService.getProvider(modelProvider.providerName, false, organizationId)
            if (!provider) {
                continue
            }

            if (
                !usesConfiguredModelCatalog(modelProvider) &&
                provider.getProviderModels()?.some((model) => !!model.model && model.deprecated !== true)
            ) {
                return true
            }
            if (!usesConfiguredModelCatalog(modelProvider) && copilot.copilotModel?.model) {
                return true
            }

            const customModels = await this.providerModelRepository.find({
                where: {
                    tenantId,
                    providerId: modelProvider.id
                }
            })
            if (
                customModels.some(
                    (model) =>
                        !!model.modelName && model.isValid !== false && isConfiguredModelAvailable(modelProvider, model)
                )
            ) {
                return true
            }
        }

        return false
    }
}
