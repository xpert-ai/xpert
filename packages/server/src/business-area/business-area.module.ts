import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CqrsModule } from '@nestjs/cqrs'
import { BusinessAreaAccessGrant } from './access/business-area-access.entity'
import { BusinessAreaAccessService } from './access/business-area-access.service'
import { BusinessAreaAccessController } from './access/business-area-access.controller'
import { AssertBusinessAreaAccessHandler } from './access/assert-business-area-access.handler'

import { BusinessAreaController } from './business-area.controller'
import { BusinessArea } from './business-area.entity'
import { BusinessAreaService } from './business-area.service'

@Module({
	imports: [
		CqrsModule,
		RouterModule.register([{ path: '/business-area', module: BusinessAreaModule }]),
		TypeOrmModule.forFeature([BusinessArea, BusinessAreaAccessGrant])
	],
	controllers: [BusinessAreaAccessController, BusinessAreaController],
	providers: [BusinessAreaService, BusinessAreaAccessService, AssertBusinessAreaAccessHandler],
	exports: [TypeOrmModule, BusinessAreaService]
})
export class BusinessAreaModule {}
