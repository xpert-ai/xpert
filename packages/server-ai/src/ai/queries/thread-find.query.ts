import { Query } from '@nestjs/cqrs'
import { ThreadDTO } from '../dto'

export class FindThreadQuery extends Query<ThreadDTO> {
	static readonly type = '[Agent Protocol] Find one thread'

	constructor(
		public readonly threadId: string,
		public readonly relations?: string[]
	) {
		super()
	}
}
