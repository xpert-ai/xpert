import { IQuery } from '@nestjs/cqrs'

export class GetStorageFileQuery implements IQuery {
	static readonly type = '[StorageFile] Get files'

	constructor(public readonly ids: string[],) {}
}
