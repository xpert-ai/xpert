import { IQuery } from '@nestjs/cqrs';

export class UseApiKeyQuery implements IQuery {
	static readonly type = '[ApiKey] Use';

	constructor(
		public readonly token: string,
	) {}
}
