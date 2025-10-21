import { IQuery } from '@nestjs/cqrs'
import { FindOneOptions } from 'typeorm'
import { Integration } from '../integration.entity'

export class GetIntegrationQuery implements IQuery {
	static readonly type = '[Integration] Get one'

	constructor(
		public readonly id: string,
		public readonly params?: FindOneOptions<Integration>
	) {}
}
