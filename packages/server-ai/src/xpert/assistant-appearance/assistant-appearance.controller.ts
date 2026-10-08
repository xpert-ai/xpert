import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common'
import { UUIDValidationPipe, ZodValidationPipe } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { AssistantAppearanceService } from './assistant-appearance.service'
import { AssistantAppearanceInput, assistantAppearanceInputSchema } from './assistant-appearance.schema'

const invalid = () => new BadRequestException(t('server-ai:Error.AssistantAppearanceInvalid'))
@Controller()
export class AssistantAppearanceController {
    constructor(private readonly appearance: AssistantAppearanceService) {}
    @Get(':id/appearance')
    get(@Param('id', UUIDValidationPipe) id: string) {
        return this.appearance.get(id)
    }
    @Post(':id/appearance')
    save(
        @Param('id', UUIDValidationPipe) id: string,
        @Body(new ZodValidationPipe(assistantAppearanceInputSchema, invalid)) input: AssistantAppearanceInput
    ) {
        return this.appearance.save(id, input)
    }
}
