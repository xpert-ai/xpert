import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { RouterModule } from '@nestjs/core';
import { PermissionApproval } from './permission-approval.entity';
import { TenantModule, UserModule } from '@metad/server-core';
import { PermissionApprovalControler } from './permission-approval.controller';
import { CommandHandlers } from './commands/handlers';
import { PermissionApprovalService } from './permission-approval.service';
import { PermissionApprovalUserModule } from '../permission-approval-user/permission-approval-user.module';
import { QueryHandlers } from './queries/handlers';


@Module({
	imports: [
		RouterModule.register([
			{ path: '/permission-approval', module: PermissionApprovalModule }
		]),
		TypeOrmModule.forFeature([
			PermissionApproval,
		]),
		CqrsModule,
		TenantModule,
		UserModule,

		PermissionApprovalUserModule
	],
	controllers: [ PermissionApprovalControler ],
	providers: [
        PermissionApprovalService,
		...CommandHandlers,
		...QueryHandlers
	],
	exports: []
})
export class PermissionApprovalModule {}
