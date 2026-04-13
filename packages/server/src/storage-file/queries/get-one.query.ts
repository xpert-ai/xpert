import { IStorageFile } from '@xpert-ai/contracts'
import { Query } from '@nestjs/cqrs'

export class GetStorageFileQuery extends Query<IStorageFile[]> {
	static readonly type = '[StorageFile] Get files'

	constructor(public readonly ids: string[],) {
		super()
	}
}
