import { t } from 'i18next'
import { BadRequestException, Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
    AllowClientSecretBindings,
    ApiKeyOrClientSecretAuthGuard,
    Public,
    ZodValidationPipe
} from '@xpert-ai/server-core'
import { SecretTokenBindingType, templateSetupUpdateSchema, type TemplateSetupUpdate } from '@xpert-ai/contracts'
import { AssistantTemplateSetupCommand } from '../xpert/template-setup/template-setup.command'
import { assertAssistantAudience } from './assistant-audience'

@Public()
@AllowClientSecretBindings(SecretTokenBindingType.ENTERPRISE_XPERT)
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@Controller('assistants/:assistantId/template-setup')
export class AssistantTemplateSetupRuntimeController {
    constructor(private readonly commands: CommandBus) {}
    @Get()
    get(@Param('assistantId') id: string) {
        assertAssistantAudience(id)
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
        assertAssistantAudience(id)
        return this.commands.execute(new AssistantTemplateSetupCommand(id, update))
    }
}
