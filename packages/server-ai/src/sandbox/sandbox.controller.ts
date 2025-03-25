import { TransformInterceptor } from '@metad/server-core'
import { Controller, Logger, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { I18nService } from 'nestjs-i18n'

@ApiTags('Sandbox')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class SandboxController {
	readonly #logger = new Logger(SandboxController.name)
	constructor(
		private readonly i18n: I18nService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}
}
