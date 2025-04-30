import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { RouterModule } from 'nest-router'
import { StorageFileController } from './storage-file.controller';
import { StorageFile } from './storage-file.entity';
import { StorageFileService } from './storage-file.service';
import { CommandHandlers } from './commands/handlers';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';
import { QueryHandlers } from './queries/handlers';

@Module({
	controllers: [
		StorageFileController
	],
	imports: [
		RouterModule.forRoutes([{ path: '/storage-file', module: StorageFileModule }]),
		TypeOrmModule.forFeature([ StorageFile ]),
		TenantModule,
		CqrsModule,
		UserModule
	],
	providers: [
		StorageFileService,
		...CommandHandlers,
		...QueryHandlers
	],
	exports: [
		TypeOrmModule,
		StorageFileService
	]
})
export class StorageFileModule {}
