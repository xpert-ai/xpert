import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { RouterModule } from '@nestjs/core';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getConfig } from '@metad/server-config';
import { ImportAllController } from './import-all.controller';
// import { ImportAllService } from './import-all.service';
import { coreEntities } from './../../core/entities';
import { CommandHandlers } from './commands/handlers';
import { ImportRecordModule } from './../import-record';
import { ImportHistoryModule } from './../import-history';

@Module({
	imports: [
		RouterModule.register([
			{
				path: '/import',
				module: ImportAllModule
			}
		]),
		CqrsModule,
		MulterModule.register({
			dest: './import'
		}),
		TypeOrmModule.forFeature([
			...coreEntities,
			// ...getEntitiesFromPlugins(getConfig().plugins)
		]),
		ImportRecordModule,
		ImportHistoryModule
	],
	controllers: [ImportAllController],
	providers: [
		// ImportAllService,
		...CommandHandlers
	],
	exports: [
		// ImportAllService
	]
})
export class ImportAllModule {}
