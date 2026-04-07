import { IApiKey } from '@metad/contracts'
import { Query } from '@nestjs/cqrs'

export class UseApiKeyQuery extends Query<IApiKey> {
	static readonly type = '[ApiKey] Use'

	constructor(public readonly token: string) {
		super()
	}
}
