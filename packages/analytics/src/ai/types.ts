import { ISemanticModel } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { Cache } from 'cache-manager'
import { ChatBIModelService } from '../chatbi-model'
import { NgmDSCoreService } from '../model/ocap'
import { SemanticModelService } from '../model'

// BI Context
export type TBIContext = {
	dsCoreService: NgmDSCoreService
	modelService: ChatBIModelService
	semanticModelService: SemanticModelService
	cacheManager: Cache
	models?: ISemanticModel[]
	logger?: Logger
	dataPermission?: boolean
}
