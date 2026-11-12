import { ICommand } from '@nestjs/cqrs'

export class DeleteXpertTaskCommand implements ICommand {
    static readonly type = '[Xpert Task] Delete'

    constructor(
        public readonly name: string,
        public readonly xpertId: string,
        public readonly projectId?: string,
        public readonly taskId?: string
    ) {}
}
