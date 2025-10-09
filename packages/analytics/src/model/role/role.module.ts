import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SharedModule, TenantModule } from '@metad/server-core'
import { SemanticModelRole } from './role.entity'
import { SemanticModelRoleService } from './role.service'


@Module({
	imports: [
		TypeOrmModule.forFeature([SemanticModelRole]),
		forwardRef(() => TenantModule),
		SharedModule,
		CqrsModule,
	],
	providers: [SemanticModelRoleService],
	exports: [SemanticModelRoleService],
})
export class SemanticModelRoleModule {}
