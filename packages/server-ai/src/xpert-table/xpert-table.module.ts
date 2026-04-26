import { TenantModule } from '@xpert-ai/server-core'
import { Module, forwardRef } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Strategies, Validators } from './plugins'
import { XpertTableController } from './xpert-table.controller'
import { XpertTable } from './xpert-table.entity'
import { XpertTableService } from './xpert-table.service'
import { XpertWorkspaceModule } from '../xpert-workspace'

@Module({
	imports: [TypeOrmModule.forFeature([XpertTable]), TenantModule, CqrsModule, forwardRef(() => XpertWorkspaceModule)],
	controllers: [XpertTableController],
	providers: [XpertTableService, ...Validators, ...Strategies]
})
export class XpertTableModule {}
