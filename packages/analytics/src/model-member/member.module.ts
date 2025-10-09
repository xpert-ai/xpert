import { CopilotModule } from '@metad/server-ai'
import { DatabaseModule, SharedModule, TenantModule } from '@metad/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { SemanticModelModule } from '../model/model.module'
import { ModelMemberController } from './member.controller'
import { SemanticModelMember } from './member.entity'
import { SemanticModelMemberService } from './member.service'
import { QueryHandlers } from './queries/handlers'
import { provideOcap } from '../model/ocap'
import { CommandHandlers } from './commands/handlers'

@Module({
	imports: [
		RouterModule.register([{ path: '/semantic-model-member', module: SemanticModelMemberModule }]),
		TypeOrmModule.forFeature([SemanticModelMember]),
		forwardRef(() => TenantModule),
		SharedModule,
		CqrsModule,
		forwardRef(() => SemanticModelModule),
		forwardRef(() => CopilotModule),
		DatabaseModule,
	],
	controllers: [ModelMemberController],
	providers: [SemanticModelMemberService, ...QueryHandlers, ...CommandHandlers, ...provideOcap()],
	exports: [SemanticModelMemberService]
})
export class SemanticModelMemberModule {}
