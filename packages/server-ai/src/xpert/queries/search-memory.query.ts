import { LongTermMemoryTypeEnum } from '@metad/contracts';
import { IQuery } from '@nestjs/cqrs'

/**
 * Search long-term memory of xpert
 */
export class SearchXpertMemoryQuery implements IQuery {
	static readonly type = '[Xpert] Search memory'

	constructor(
		public readonly xpertId: string,
        public readonly options: {
			type: LongTermMemoryTypeEnum;
			text: string;
			isDraft?: boolean
		}
	) {}
}
