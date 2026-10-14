import {
    Controller,
    DefaultValuePipe,
    Get,
    Param,
    ParseBoolPipe,
    Query,
    UseGuards,
    UseInterceptors
} from '@nestjs/common'
import { SecretTokenBindingType } from '@xpert-ai/contracts'
import {
    AllowClientSecretBindings,
    ApiKeyOrClientSecretAuthGuard,
    Public,
    TransformInterceptor
} from '@xpert-ai/server-core'
import { ConnectorService } from '../connector/connector.service'
import { assertAssistantAudience } from './assistant-audience'

/** Read-only ChatKit facade. OAuth and connection mutations remain on the administrator API. */
@Public()
@AllowClientSecretBindings(SecretTokenBindingType.ENTERPRISE_XPERT)
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@UseInterceptors(TransformInterceptor)
@Controller('assistants/:assistantId/connectors')
export class ConnectorRuntimeController {
    constructor(private readonly connectors: ConnectorService) {}

    @Get()
    catalog(
        @Param('assistantId') assistantId: string,
        @Query('projectId') projectId?: string,
        @Query('includeWorkspace', new DefaultValuePipe(false), new ParseBoolPipe()) includeWorkspace = false
    ) {
        assertAssistantAudience(assistantId)
        return this.connectors.runtimeOptions(assistantId, projectId, includeWorkspace)
    }

    @Get(':bindingId/status')
    async status(@Param('assistantId') assistantId: string, @Param('bindingId') bindingId: string) {
        assertAssistantAudience(assistantId)
        const result = await this.connectors.authorizationStatusBinding(bindingId, assistantId)
        return { bindingId: result.connector.id, status: result.connector.status, granted: result.granted === true }
    }
}
