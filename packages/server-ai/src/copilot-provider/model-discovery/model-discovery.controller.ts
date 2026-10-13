import { AIPermissionsEnum, modelImportSchema, ModelImportInput } from '@xpert-ai/contracts'
import { PermissionGuard, Permissions, UUIDValidationPipe, ZodValidationPipe } from '@xpert-ai/server-core'
import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { t } from 'i18next'
import { ModelDiscoveryService } from './model-discovery.service'

@Controller(':providerId/model-discovery')
@UseGuards(PermissionGuard)
@Permissions(AIPermissionsEnum.COPILOT_EDIT)
export class ModelDiscoveryController {
    constructor(private readonly service: ModelDiscoveryService) {}

    @Get()
    discover(@Param('providerId', UUIDValidationPipe) providerId: string) {
        return this.service.discover(providerId)
    }

    @Post()
    importModels(
        @Param('providerId', UUIDValidationPipe) providerId: string,
        @Body(
            new ZodValidationPipe(
                modelImportSchema,
                () => new BadRequestException(t('server-ai:Error.ModelDiscoverySelectionInvalid'))
            )
        )
        input: ModelImportInput
    ) {
        return this.service.importModels(providerId, input)
    }
}
