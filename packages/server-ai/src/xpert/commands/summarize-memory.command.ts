import { LongTermMemoryTypeEnum } from '@metad/contracts';
import { ICommand } from '@nestjs/cqrs'

/**
 * Summarize long-term memory from an execution of chat conversation
 */
export class XpertSummarizeMemoryCommand implements ICommand {
	static readonly type = '[Xpert] Summarizing long-term memory'

	constructor(
        public readonly id: string,
        public readonly executionId: string,
        public readonly options: {
            types: LongTermMemoryTypeEnum[]
            userId: string;
            isDraft: boolean;
        },
    ) { }
}
