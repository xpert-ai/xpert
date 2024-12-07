import { IXpert } from '@metad/contracts'
import { IQuery } from '@nestjs/cqrs'
import { FindConditions } from 'typeorm'

export class FindXpertQuery implements IQuery {
	static readonly type = '[Xpert] Find One'

	constructor(
		public readonly conditions: FindConditions<IXpert>,
		public readonly relations?: string[]
	) {}
}
