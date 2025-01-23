import { TenantModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { RouterModule } from 'nest-router'
import { XpertTemplateService } from './xpert-template.service'
import { XpertTemplateController } from './xpert-template.controller'


@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/xpert-template', module: XpertTemplateModule }]),
		TenantModule,
		CqrsModule,
	],
	controllers: [XpertTemplateController],
	providers: [XpertTemplateService,],
	exports: [XpertTemplateService]
})
export class XpertTemplateModule {}
