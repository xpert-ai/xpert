import { CrudController } from '@metad/server-core'
import { Controller, Get } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ChatBIModel } from './chatbi-model.entity'
import { ChatBIModelService } from './chatbi-model.service'

@ApiTags('ChatBIModel')
@ApiBearerAuth()
@Controller()
export class ChatBIModelController extends CrudController<ChatBIModel> {
	constructor(private readonly service: ChatBIModelService) {
		super(service)
	}

	@Get('model-select-options')
	async getModelSelectOptions() {
		const { items } = await this.service.findAll()
		return items.map((item) => ({
			value: item.id,
			label: item.entityCaption
		}))
	}
}
