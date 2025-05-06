import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { GetStorageFileQuery } from '../get-one.query'
import { StorageFileService } from '../../storage-file.service'

@QueryHandler(GetStorageFileQuery)
export class GetStorageFileHandler implements IQueryHandler<GetStorageFileQuery> {
	protected logger = new Logger(GetStorageFileHandler.name)

	constructor(
		private readonly queryBus: QueryBus,
		private readonly service: StorageFileService,
	) {}

	public async execute(command: GetStorageFileQuery) {
		const { id } = command
		return this.service.findOne(id)
	}
}
