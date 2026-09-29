import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { AssistantTriggerService } from './assistant-trigger.service'
import { parseTriggerMutation } from './assistant-trigger.validation'

@Controller(':id/trigger-settings')
export class AssistantTriggerController {
    constructor(private readonly triggers: AssistantTriggerService) {}

    @Get()
    list(@Param('id') id: string) {
        return this.triggers.list(id)
    }

    @Post('validate')
    validate(@Param('id') id: string, @Body() body: unknown) {
        return this.triggers.validate(id, parseTriggerMutation(body))
    }

    @Post()
    save(@Param('id') id: string, @Body() body: unknown) {
        return this.triggers.mutate(id, parseTriggerMutation(body))
    }
}
