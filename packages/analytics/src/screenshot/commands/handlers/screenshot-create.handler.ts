import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { BadRequestException } from '@nestjs/common';
import * as moment from 'moment';
import { ScreenshotCreateCommand } from './../screenshot-create.command';
import { ScreenshotService } from './../../../screenshot/screenshot.service';
import { RequestContext } from '@metad/server-core';

@CommandHandler(ScreenshotCreateCommand)
export class ScreenshotCreateHandler
	implements ICommandHandler<ScreenshotCreateCommand> {

	constructor(
		private readonly _screenshotService: ScreenshotService,
		private readonly _commandBus: CommandBus
	) {}

	public async execute(command: ScreenshotCreateCommand): Promise<any> {
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

			return await this._screenshotService.create({
				file,
				thumb,
				recordedAt,
				organizationId
			});
		} catch (error) {
			throw new BadRequestException(error, `Can'\t create SCREENSHOT for xxx`);
		}
	}
}
