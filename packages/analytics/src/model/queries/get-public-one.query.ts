import { IQuery } from '@nestjs/cqrs'

export class GetOnePublicSemanticModelQuery implements IQuery {
	static readonly type = '[Semantic Model] Get public one'

	constructor(public readonly id: string) {}
}
