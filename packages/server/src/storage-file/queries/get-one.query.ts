import { IQuery } from '@nestjs/cqrs'

export class GetStorageFileQuery implements IQuery {
	static readonly type = '[StorageFile] Get one'

	constructor(public readonly id: string,) {}
}
