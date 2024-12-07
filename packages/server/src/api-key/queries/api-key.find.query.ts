import { IQuery } from '@nestjs/cqrs';

export class FindApiKeyQuery implements IQuery {
	static readonly type = '[ApiKey] Find';

	constructor(
		public readonly input: string,
	) {}
}
