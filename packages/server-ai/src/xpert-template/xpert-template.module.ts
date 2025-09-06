import { TenantModule } from '@metad/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CqrsModule } from '@nestjs/cqrs'
import { RouterModule } from '@nestjs/core'
import { XpertTemplateService } from './xpert-template.service'
import { XpertTemplateController } from './xpert-template.controller'
import { XpertTemplate } from './xpert-template.entity'


@Module({
	imports: [
		RouterModule.register([{ path: '/xpert-template', module: XpertTemplateModule }]),
		TypeOrmModule.forFeature([ XpertTemplate ]),
		TenantModule,
		CqrsModule,
	],
	controllers: [XpertTemplateController],
	providers: [XpertTemplateService,],
	exports: [XpertTemplateService]
})
export class XpertTemplateModule {}
