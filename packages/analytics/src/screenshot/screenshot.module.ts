import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { Screenshot } from './screenshot.entity';
import { ScreenshotController } from './screenshot.controller';
import { ScreenshotService } from './screenshot.service';
import { CommandHandlers } from './commands/handlers';
import { TenantModule, UserModule } from '@metad/server-core';
import { RouterModule } from '@nestjs/core'

@Module({
	controllers: [
		ScreenshotController
	],
	imports: [
		RouterModule.register([{ path: '/screenshot', module: ScreenshotModule }]),
		TypeOrmModule.forFeature([ Screenshot ]),
		TenantModule,
		CqrsModule,
		UserModule
	],
	providers: [
		ScreenshotService,
		...CommandHandlers
	],
	exports: [
		ScreenshotService
	]
})
export class ScreenshotModule {}
