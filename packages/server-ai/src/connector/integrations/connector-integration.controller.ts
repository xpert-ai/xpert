import { BadRequestException, Body, Controller, Get, Header, Param, Post, Query } from '@nestjs/common'
import { ZodValidationPipe } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { ConnectorIntegrationService } from './connector-integration.service'
import {
    connectorBindingIdSchema,
    connectorIntegrationQuerySchema,
    connectorIntegrationRequestSchema,
    type ConnectorIntegrationQuery,
    type ConnectorIntegrationInput
} from './connector-integration.schema'

const invalid = () => new BadRequestException(t('server-ai:Error.ConnectorIntegrationInvalid'))
@Controller()
export class ConnectorIntegrationController {
    constructor(private readonly integrations: ConnectorIntegrationService) {}

    @Get('integration-options')
    @Header('Cache-Control', 'no-store')
    list(@Query(new ZodValidationPipe(connectorIntegrationQuerySchema, invalid)) input: ConnectorIntegrationQuery) {
        return this.integrations.list(input.workspaceId, input.provider, input.authMethodId)
    }

    @Post('bindings/:bindingId/integration')
    @Header('Cache-Control', 'no-store')
    prepare(
        @Param('bindingId', new ZodValidationPipe(connectorBindingIdSchema, invalid)) bindingId: string,
        @Body(new ZodValidationPipe(connectorIntegrationRequestSchema, invalid)) input: ConnectorIntegrationInput
    ) {
        return this.integrations.prepare(bindingId, input)
    }
}
