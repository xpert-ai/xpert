import { Controller, Logger, Post, Body, UseGuards } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CopilotService } from '../copilot'
import { AiService } from './ai.service'
import type { paths, components } from "./schemas/agent-protocol-schema"
import { ApiKeyAuthGuard, Public, CurrentUser } from '@metad/server-core'
import { IUser } from '@metad/contracts'

@ApiTags('AI/Threads')
@ApiBearerAuth()
@Public()
@UseGuards(ApiKeyAuthGuard)
@Controller('threads')
export class ThreadsController {
	readonly #logger = new Logger(ThreadsController.name)

	constructor(
		private readonly aiService: AiService,
		private readonly copilotService: CopilotService,
		private readonly queryBus: QueryBus
	) {}

    @Post()
    async createThread(
		@Body() body: components['schemas']['ThreadCreate'],
	    @CurrentUser() user: IUser,
	) {
        // console.log(body, user)
		
		return body
    }
}
