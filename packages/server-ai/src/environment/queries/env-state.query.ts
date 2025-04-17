import { IQuery } from '@nestjs/cqrs'

export class EnvStateQuery implements IQuery {
	static readonly type = '[Environment] Get Default State'

	constructor(public readonly workspaceId: string) {}
}
