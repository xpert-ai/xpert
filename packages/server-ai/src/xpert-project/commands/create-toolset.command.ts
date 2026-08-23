import { ICommand } from '@nestjs/cqrs'
import type { TBuiltinToolsetParams } from '../../shared'

export class CreateProjectToolsetCommand implements ICommand {
    static readonly type = '[Xpert Project] Create toolset'

    constructor(
        public readonly projectId: string,
        public readonly params?: Partial<TBuiltinToolsetParams>
    ) {}
}
