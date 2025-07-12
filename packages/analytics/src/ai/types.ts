import { ISemanticModel } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { Cache } from 'cache-manager'
import { ChatBIModelService } from '../chatbi-model'
import { NgmDSCoreService } from '../model/ocap'

// BI Context
export type TBIContext = {
	dsCoreService: NgmDSCoreService
	modelService: ChatBIModelService
	cacheManager: Cache
	models?: ISemanticModel[]
	logger?: Logger
	dataPermission?: boolean
}
