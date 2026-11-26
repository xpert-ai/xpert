import { BadRequestException, Body, Controller, Header, Param, Post } from '@nestjs/common'
import { t } from 'i18next'
import { QueryBus } from '@nestjs/cqrs'
import {
    AIPermissionsEnum,
    assistantWorkbenchViewInputSchema,
    type AssistantWorkbenchViewInput
} from '@xpert-ai/contracts'
import { Permissions, UUIDValidationPipe, ZodValidationPipe } from '@xpert-ai/server-core'
import { AssistantWorkbenchEntryQuery } from './queries/assistant-workbench-entry.query'

@Controller()
@Permissions(AIPermissionsEnum.CHAT_VIEW)
export class WorkbenchNavigationController {
    constructor(private readonly queries: QueryBus) {}

    @Post(':id/workbench-navigation')
    @Header('Cache-Control', 'no-store')
    resolve(
        @Param('id', UUIDValidationPipe) assistantId: string,
        @Body(
            new ZodValidationPipe(
                assistantWorkbenchViewInputSchema,
                () => new BadRequestException(t('server-ai:Error.WorkbenchEntryInputInvalid'))
            )
        )
        location: AssistantWorkbenchViewInput
    ) {
        return this.queries.execute(new AssistantWorkbenchEntryQuery(assistantId, location))
    }
}
