import { TenantModule } from '@metad/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from 'nest-router'
import { XpertProject } from './project.entity'
import { XpertProjectController } from './project.controller'
import { XpertProjectService } from './project.service'

@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/xpert-project', module: XpertProjectModule }]),
		TypeOrmModule.forFeature([XpertProject]),
		TenantModule,
		CqrsModule,
	],
	controllers: [XpertProjectController],
	providers: [XpertProjectService,],
	exports: [XpertProjectService]
})
export class XpertProjectModule {}
