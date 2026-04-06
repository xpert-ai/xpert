import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CqrsModule } from '@nestjs/cqrs'
import { RouterModule } from '@nestjs/core'
import { EnvironmentController } from './environment.controller'
import { Environment } from './environment.entity'
import { EnvironmentService } from './environment.service'
import { XpertWorkspaceModule } from '../xpert-workspace'
import { QueryHandlers } from './queries/handlers'
import { SandboxViewHostDefinition } from '../view-extension/hosts/sandbox-view-host.definition'

@Module({
	imports: [
		RouterModule.register([{ path: '/environment', module: EnvironmentModule }]),
		TypeOrmModule.forFeature([Environment]),
		CqrsModule,
		forwardRef(() => XpertWorkspaceModule),
	],
	controllers: [EnvironmentController],
	providers: [EnvironmentService, SandboxViewHostDefinition, ...QueryHandlers],
	exports: [EnvironmentService]
})
export class EnvironmentModule {}
