import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { In } from 'typeorm'
import { StorageFileService } from '../../storage-file.service'
import { GetStorageFileQuery } from '../get-one.query'

@QueryHandler(GetStorageFileQuery)
export class GetStorageFileHandler implements IQueryHandler<GetStorageFileQuery> {
	protected logger = new Logger(GetStorageFileHandler.name)

	constructor(
		private readonly service: StorageFileService
	) {}

	public async execute(command: GetStorageFileQuery) {
		const { ids } = command
		const {items} = await this.service.findAll({ where: { id: In(ids) } })
		return items
	}
}
