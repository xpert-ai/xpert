import { TChatAgentParams } from '@metad/contracts'
import { CrudController, TransformInterceptor } from '@metad/server-core'
import { Body, Controller, Header, Logger, Post, Sse, UseInterceptors, Res } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CommandBus } from '@nestjs/cqrs'
import { Response } from 'express'
import { Observable } from 'rxjs'
import { XpertAgent } from './xpert-agent.entity'
import { XpertAgentService } from './xpert-agent.service'
import { takeUntilClose } from '@metad/server-common'

@ApiTags('XpertAgent')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class XpertAgentController extends CrudController<XpertAgent> {
	readonly #logger = new Logger(XpertAgentController.name)

	constructor(
		private readonly service: XpertAgentService,
		private readonly commandBus: CommandBus,
	) {
		super(service)
	}

	@Header('content-type', 'text/event-stream')
	@Header('Connection', 'keep-alive')
	@Post('chat')
	@Sse()
	async chatAgent(@Res() res: Response, @Body() body: TChatAgentParams): Promise<Observable<MessageEvent>> {
		return (await this.service.chatAgent(body)).pipe(takeUntilClose(res))
	}
}
