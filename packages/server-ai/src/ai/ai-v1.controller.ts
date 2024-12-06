import { Controller, Logger } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CopilotService } from '../copilot'
import { AiService } from './ai.service'

@ApiTags('AI/v1')
@ApiBearerAuth()
@Controller('v1')
export class AIV1Controller {
	readonly #logger = new Logger(AIV1Controller.name)

	constructor(
		private readonly aiService: AiService,
		private readonly copilotService: CopilotService,
		private readonly queryBus: QueryBus
	) {}
}
