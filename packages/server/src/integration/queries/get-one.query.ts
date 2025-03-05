import { IQuery } from '@nestjs/cqrs'

export class GetIntegrationQuery implements IQuery {
	static readonly type = '[Integration] Get one'

	constructor(public readonly id: string,) {}
}
