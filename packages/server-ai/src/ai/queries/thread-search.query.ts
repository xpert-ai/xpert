import { IQuery } from '@nestjs/cqrs'
import type { components } from '../schemas/agent-protocol-schema'

export class SearchThreadsQuery implements IQuery {
	static readonly type = '[Agent Protocol] Search threads'

	constructor(
		public readonly request: components['schemas']['ThreadSearchRequest'],
	) {}
}
