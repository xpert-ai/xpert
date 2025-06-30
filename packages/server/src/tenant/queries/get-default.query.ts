import { IQuery } from '@nestjs/cqrs'

export class GetDefaultTenantQuery implements IQuery {
	static readonly type = '[Tenant] Get default'

	constructor() {
		//
	}
}
