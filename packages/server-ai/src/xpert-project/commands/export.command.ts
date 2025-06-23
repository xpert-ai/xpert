import { ICommand } from '@nestjs/cqrs'

/**
 */
export class ExportProjectCommand implements ICommand {
    static readonly type = '[Xpert Project] Export'

    constructor(
        public readonly projectId: string,
    ) {}
}
