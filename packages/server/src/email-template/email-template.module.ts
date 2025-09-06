import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { RouterModule } from '@nestjs/core';
import { EmailTemplate } from './email-template.entity';
import { EmailTemplateService } from './email-template.service';
import { EmailTemplateController } from './email-template.controller';
import { QueryHandlers } from './queries/handlers';
import { CommandHandlers } from './commands/handlers';
import { TenantModule } from '../tenant/tenant.module';
import { EventHandlers } from './events/handlers';

@Module({
	imports: [
		RouterModule. register([
			{ path: '/email-template', module: EmailTemplateModule }
		]),
		TypeOrmModule.forFeature([EmailTemplate]),
		CqrsModule,
		forwardRef(() => TenantModule)
	],
	controllers: [EmailTemplateController],
	providers: [
		EmailTemplateService,
		...QueryHandlers,
		...CommandHandlers,
		...EventHandlers
	],
	exports: [
		EmailTemplateService,
		TypeOrmModule
	]
})
export class EmailTemplateModule {}
