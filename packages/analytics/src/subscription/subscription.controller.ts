import { Controller, Get } from '@nestjs/common';
import {
    ApiBearerAuth, ApiTags
} from '@nestjs/swagger';
import { CrudController } from '@xpert-ai/server-core';
import { SubscriptionService } from './subscription.service';
import { Subscription } from './subscription.entity';

@ApiTags('Subscription')
@ApiBearerAuth()
@Controller()
export class SubscriptionController extends CrudController<Subscription> {
    constructor(
		private readonly service: SubscriptionService,
	) {
		super(service);
	}
}
