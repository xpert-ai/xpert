import { ISemanticModel } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Cache } from 'cache-manager'
import { ChatBIModelService } from '../chatbi-model'
import { NgmDSCoreService } from '../model/ocap'
import { SemanticModelService } from '../model'
import { IndicatorService } from '../indicator'

// BI Context
export type TBIContext = {
	tenantId: string
	organizationId: string
	queryBus?: QueryBus
	commandBus?: CommandBus
	dsCoreService: NgmDSCoreService
	modelService: ChatBIModelService
	semanticModelService: SemanticModelService
	indicatorService: IndicatorService
	cacheManager: Cache
	models?: ISemanticModel[]
	logger?: Logger
	dataPermission?: boolean
}
