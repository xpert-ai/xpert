import { CopilotModule } from '@metad/server-ai'
import { DatabaseModule, SharedModule, TenantModule } from '@metad/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from 'nest-router'
import { SemanticModelModule } from '../model/model.module'
import { OcapModule } from '../model/ocap'
import { ModelMemberController } from './member.controller'
import { SemanticModelMember } from './member.entity'
import { SemanticModelMemberService } from './member.service'
import { QueryHandlers } from './queries/handlers'

@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/semantic-model-member', module: SemanticModelMemberModule }]),
		forwardRef(() => TypeOrmModule.forFeature([SemanticModelMember])),
		forwardRef(() => TenantModule),
		SharedModule,
		CqrsModule,
		forwardRef(() => SemanticModelModule),
		forwardRef(() => CopilotModule),
		DatabaseModule,
		OcapModule
	],
	controllers: [ModelMemberController],
	providers: [SemanticModelMemberService, ...QueryHandlers],
	exports: [SemanticModelMemberService]
})
export class SemanticModelMemberModule {}
