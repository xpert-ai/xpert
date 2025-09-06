import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { RouterModule } from '@nestjs/core';
import { TagService } from './tag.service';
import { TagController } from './tag.controller';
import { Tag } from './tag.entity';
import { UserModule } from '../user/user.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
	imports: [
		RouterModule.register([{ path: '/tags', module: TagModule }]),
		TypeOrmModule.forFeature([Tag]),
		UserModule,
		TenantModule
	],
	controllers: [TagController],
	providers: [TagService],
	exports: [TagService]
})
export class TagModule {}
