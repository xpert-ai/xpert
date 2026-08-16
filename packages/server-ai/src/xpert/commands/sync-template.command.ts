import { LanguagesEnum } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'

export class XpertSyncTemplateCommand implements ICommand {
    static readonly type = '[Xpert] Sync Template'

    constructor(
        public readonly xpertId: string,
        public readonly language?: LanguagesEnum
    ) {}
}
