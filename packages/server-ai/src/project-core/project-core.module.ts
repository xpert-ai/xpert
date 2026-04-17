import { TenantModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ProjectCoreController } from './project-core.controller'
import { ProjectCore } from './project-core.entity'
import { ProjectCoreService } from './project-core.service'

@Module({
	imports: [
		RouterModule.register([{ path: '/project-core', module: ProjectCoreModule }]),
		TypeOrmModule.forFeature([ProjectCore]),
		TenantModule
	],
	controllers: [ProjectCoreController],
	providers: [ProjectCoreService],
	exports: [ProjectCoreService]
})
export class ProjectCoreModule {}
