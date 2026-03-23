import { IQuery } from '@nestjs/cqrs'

export class ResolveLatestPluginVersionQuery implements IQuery {
	static readonly type = '[Plugin] Resolve Latest Version'

	constructor(public readonly packageName: string) {}
}
