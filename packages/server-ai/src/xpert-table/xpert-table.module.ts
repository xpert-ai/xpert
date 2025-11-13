import { TenantModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertTableController } from './xpert-table.controller'
import { XpertTable } from './xpert-table.entity'
import { XpertTableService } from './xpert-table.service'

@Module({
	imports: [
		TypeOrmModule.forFeature([XpertTable]),
		TenantModule,
		CqrsModule
	],
	controllers: [XpertTableController],
	providers: [XpertTableService]
})
export class XpertTableModule {}
