import { t } from 'i18next'
import { BadRequestException, Body, Controller, Get, Param, Put } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ZodValidationPipe } from '@xpert-ai/server-core'
import { templateSetupUpdateSchema, type TemplateSetupUpdate } from '@xpert-ai/contracts'
import { AssistantTemplateSetupCommand } from './template-setup.command'
import {
    TemplateRoutinesCommand,
    templateRoutineUpdateSchema,
    type TemplateRoutineUpdate
} from '../../xpert-task/template-routines/template-routines.command'

@Controller(':assistantId/template-setup')
export class AssistantTemplateSetupController {
    constructor(private readonly commands: CommandBus) {}
    @Get()
    get(@Param('assistantId') id: string) {
        return this.commands.execute(new AssistantTemplateSetupCommand(id))
    }
    @Put()
    update(
        @Param('assistantId') id: string,
        @Body(
            new ZodValidationPipe(
                templateSetupUpdateSchema,
                () => new BadRequestException(t('server-ai:Error.TemplateSetupInvalid'))
            )
        )
        update: TemplateSetupUpdate
    ) {
        return this.commands.execute(new AssistantTemplateSetupCommand(id, update))
    }
    @Put('routines/:key')
    routine(
        @Param('assistantId') id: string,
        @Param('key') key: string,
        @Body(
            new ZodValidationPipe(
                templateRoutineUpdateSchema,
                () => new BadRequestException(t('server-ai:Error.TemplateRoutineInvalid'))
            )
        )
        update: TemplateRoutineUpdate
    ) {
        return this.commands.execute(new TemplateRoutinesCommand(id, { key, ...update }))
    }
}
