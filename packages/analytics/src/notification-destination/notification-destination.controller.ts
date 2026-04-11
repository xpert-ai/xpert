import { Controller, Get, Param } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
    ApiBearerAuth, ApiTags
} from '@nestjs/swagger';
import { CrudController, UUIDValidationPipe } from '@xpert-ai/server-core';
import { INotificationDestinationType } from '@xpert-ai/contracts'
import { NotificationDestination } from './notification-destination.entity';
import { NotificationDestinationService } from './notification-destination.service';
import { getNotificationDestinationTypes } from './base-destination';

@ApiTags('NotificationDestination')
@ApiBearerAuth()
@Controller()
export class NotificationDestinationController extends CrudController<NotificationDestination> {
    constructor(
		private readonly service: NotificationDestinationService,
		private readonly commandBus: CommandBus
	) {
		super(service)
	}

	@Get('/types')
	async getTypes(): Promise<INotificationDestinationType[]> {
		return getNotificationDestinationTypes()
	}

	@Get('/:id/groups')
	async getGroups(@Param('id', UUIDValidationPipe) id: string): Promise<any[]> {
		return await this.service.getGroups(id)
	}
}
