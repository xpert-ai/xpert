import { SharedModule, TenantModule } from '@metad/server-core'
import { Module, forwardRef } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { IndicatorAppController } from './indicator-app.controller'
import { IndicatorApp } from './indicator-app.entity'
import { IndicatorAppService } from './indicator-app.service'

@Module({
	imports: [
		RouterModule.register([{ path: '/indicator-app', module: IndicatorAppModule }]),
		TypeOrmModule.forFeature([IndicatorApp]),
		forwardRef(() => TenantModule),
		SharedModule,
		CqrsModule
	],
	controllers: [IndicatorAppController],
	providers: [IndicatorAppService]
})
export class IndicatorAppModule {}
