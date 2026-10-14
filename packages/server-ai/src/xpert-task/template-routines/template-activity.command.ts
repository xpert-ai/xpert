import { Command } from '@nestjs/cqrs'
import type { TemplateActivity, TemplateActivityRead } from '@xpert-ai/contracts'

/** Read personal routine results or acknowledge visible notifications after Assistant authorization. */
export class TemplateActivityCommand extends Command<TemplateActivity> {
    constructor(
        readonly assistantId: string,
        readonly acknowledgement?: TemplateActivityRead
    ) {
        super()
    }
}
