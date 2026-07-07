import { ICommand } from '@nestjs/cqrs'

/**
 * @deprecated Use parsed_file_read/parsed_file_read_by_path tools or file-understanding queries.
 */
export class ConvFileGetByPathCommand implements ICommand {
    static readonly type = '[Chat Conversation] Get file by path'

    constructor(
        public readonly id: string,
        public readonly path: string
    ) {}
}
