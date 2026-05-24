import { ICommand } from '@nestjs/cqrs'

/**
 * @deprecated Use file_read/workspace_read tools or file-understanding queries.
 */
export class ConvFileGetByPathCommand implements ICommand {
    static readonly type = '[Chat Conversation] Get file by path'

    constructor(
        public readonly id: string,
        public readonly path: string
    ) {}
}
