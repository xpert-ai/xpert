import { BadRequestException, Body, Controller, Param, Put, UseGuards } from '@nestjs/common'
import {
    AIPermissionsEnum,
    EnabledModelSelection,
    enabledModelsSchema,
    isConfiguredModelAvailable,
    modelIdentityKey
} from '@xpert-ai/contracts'
import { PermissionGuard, Permissions, UUIDValidationPipe, ZodValidationPipe } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { CopilotProviderService } from '../copilot-provider.service'
import { AIProvidersService } from '../../ai-model'

@Controller()
@UseGuards(PermissionGuard)
@Permissions(AIPermissionsEnum.COPILOT_EDIT)
export class EnabledModelsController {
    constructor(
        private readonly providers: CopilotProviderService,
        private readonly strategies: AIProvidersService
    ) {}

    @Put(':id/enabled-models')
    async save(
        @Param('id', UUIDValidationPipe) id: string,
        @Body(
            new ZodValidationPipe(
                enabledModelsSchema,
                () => new BadRequestException(t('server-ai:Error.ModelDefaultInvalid'))
            )
        )
        input: { models: EnabledModelSelection[] }
    ) {
        const connection = await this.providers.findOne(id, { relations: ['models'] })
        const strategy = this.strategies.getProvider(connection.providerName, true)
        const available = new Set<string>()
        for (const model of strategy.getProviderModels() ?? []) {
            if (!model.deprecated && isConfiguredModelAvailable(connection, null))
                available.add(modelIdentityKey({ model: model.model, modelType: model.model_type }))
        }
        for (const model of connection.models ?? []) {
            const key = modelIdentityKey({ model: model.modelName, modelType: model.modelType })
            if (model.isValid === false || !isConfiguredModelAvailable(connection, model)) available.delete(key)
            else available.add(key)
        }
        if (input.models.some((model) => !available.has(modelIdentityKey(model))))
            throw new BadRequestException(t('server-ai:Error.ModelDefaultUnavailable'))
        await this.providers.assertDefaultsRemainEnabled(connection, input.models)
        await this.providers.update(id, { options: { ...connection.options, enabledModels: input.models } })
        return input.models
    }
}
