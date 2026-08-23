import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'

import { BusinessAreaController } from './business-area.controller'
import { BusinessArea } from './business-area.entity'
import { BusinessAreaService } from './business-area.service'

@Module({
	imports: [
		RouterModule.register([{ path: '/business-area', module: BusinessAreaModule }]),
		TypeOrmModule.forFeature([BusinessArea])
	],
	controllers: [BusinessAreaController],
	providers: [BusinessAreaService],
	exports: [TypeOrmModule, BusinessAreaService]
})
export class BusinessAreaModule {}
