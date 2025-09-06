import { IXpert } from '@metad/contracts'
import { FindOptionsWhere } from '@metad/server-core'
import { IQuery } from '@nestjs/cqrs'

export class FindXpertQuery implements IQuery {
	static readonly type = '[Xpert] Find One'

	constructor(
		public readonly conditions: FindOptionsWhere<IXpert>,
		public readonly params?: {
			relations?: string[]
			/**
			 * Draft First
			 */
			isDraft?: boolean
		}
	) {}
}
