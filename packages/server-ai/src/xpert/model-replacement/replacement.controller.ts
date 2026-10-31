import { BadRequestException, Body, Controller, Param, Post, UseGuards } from '@nestjs/common'
import {
    AIPermissionsEnum,
    ExecuteModelReplacementInput,
    executeModelReplacementSchema,
    ModelReplacementInput,
    modelReplacementSchema,
    ModelReplacementScope,
    modelReplacementScopeSchema
} from '@xpert-ai/contracts'
import { PermissionGuard, Permissions, UUIDValidationPipe, ZodValidationPipe } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { ModelReplacementService } from './replacement.service'

const invalid = () => new BadRequestException(t('server-ai:Error.ModelDefaultInvalid'))
@Controller('model-replacement')
@UseGuards(PermissionGuard)
@Permissions(AIPermissionsEnum.COPILOT_EDIT)
export class ModelReplacementController {
    constructor(private readonly service: ModelReplacementService) {}
    @Post('sources') sources(
        @Body(new ZodValidationPipe(modelReplacementScopeSchema, invalid)) input: ModelReplacementScope
    ) {
        return this.service.sources(input)
    }
    @Post('preview') preview(
        @Body(new ZodValidationPipe(modelReplacementSchema, invalid)) input: ModelReplacementInput
    ) {
        return this.service.preview(input)
    }
    @Post('execute') execute(
        @Body(new ZodValidationPipe(executeModelReplacementSchema, invalid)) input: ExecuteModelReplacementInput
    ) {
        return this.service.execute(input)
    }
    @Post(':id/restore') restore(@Param('id', UUIDValidationPipe) id: string) {
        return this.service.restore(id)
    }
}
