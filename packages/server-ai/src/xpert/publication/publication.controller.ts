import { BadRequestException, Body, Controller, Param, Post, UseGuards } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ZodValidationPipe } from '@xpert-ai/server-core'
import { z } from 'zod'
import { t } from 'i18next'
import { XpertGuard } from '../guards/xpert.guard'
import { XpertPublishCommand } from '../commands/publish.command'

export const resumePublicationSchema = z.object({ version: z.string().trim().min(1).max(100) }).strict()

@Controller(':id/publication')
@UseGuards(XpertGuard)
export class XpertPublicationController {
    constructor(private readonly commands: CommandBus) {}

    @Post('resume')
    resume(
        @Param('id') id: string,
        @Body(
            new ZodValidationPipe(
                resumePublicationSchema,
                () => new BadRequestException(t('server-ai:Error.XpertPublicationInvalid'))
            )
        )
        input: z.output<typeof resumePublicationSchema>
    ) {
        return this.commands.execute(
            new XpertPublishCommand(id, false, undefined, '', undefined, undefined, true, input.version)
        )
    }
}
