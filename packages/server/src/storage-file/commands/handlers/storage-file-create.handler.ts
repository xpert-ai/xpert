import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { BadRequestException } from '@nestjs/common';
import moment from 'moment';
import { StorageFileCreateCommand } from '../storage-file-create.command';
import { StorageFileService } from '../../storage-file.service';
import { RequestContext } from '../../../core';

@CommandHandler(StorageFileCreateCommand)
export class StorageFileCreateHandler
	implements ICommandHandler<StorageFileCreateCommand> {

	constructor(
		private readonly fileService: StorageFileService,
		private readonly _commandBus: CommandBus
	) {}

	public async execute(command: StorageFileCreateCommand): Promise<any> {
		try {
			const { input } = command;
			const {
				file,
				thumb,
				recordedAt,
				activityTimestamp,
				employeeId,
				organizationId
			} = input;
			const tenantId = RequestContext.currentTenantId();

			const startedAt = moment(moment.utc(activityTimestamp).format('YYYY-MM-DD HH:mm:ss')).toDate();
			const stoppedAt = moment(moment.utc(activityTimestamp).add(10, 'minutes').format('YYYY-MM-DD HH:mm:ss')).toDate();

			return await this.fileService.create({
				file,
				thumb,
				recordedAt,
				organizationId
			});
		} catch (error) {
			throw new BadRequestException(error, `Can'\t create storage file`);
		}
	}
}
