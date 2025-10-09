import { XpertModule } from '@metad/server-ai'
import { IntegrationModule, SharedModule, TenantModule } from '@metad/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { ChatBIModelController } from './chatbi-model.controller'
import { ChatBIModel } from './chatbi-model.entity'
import { ChatBIModelService } from './chatbi-model.service'

@Module({
	imports: [
		RouterModule.register([{ path: '/chatbi-model', module: ChatBIModelModule }]),
		TypeOrmModule.forFeature([ChatBIModel]),
		forwardRef(() => TenantModule),
		SharedModule,
		CqrsModule,
		XpertModule,
		IntegrationModule,
	],
	controllers: [ChatBIModelController],
	providers: [ChatBIModelService],
	exports: [ChatBIModelService]
})
export class ChatBIModelModule {}
