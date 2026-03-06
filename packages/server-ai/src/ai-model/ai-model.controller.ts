import { Public, TransformInterceptor } from '@metad/server-core'
import { Controller, Get, HttpException, HttpStatus, Param, Query, Res, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ServerResponse } from 'http'
import { AIModelGetIconQuery } from './queries'

@ApiTags('AIModel')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class AIModelController {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	@Public()
	@Get('provider/:name/:iconType/:lang')
	async getModelIcon(
		@Param('name') provider: string,
		@Param('iconType') iconType: string,
		@Param('lang') lang: string,
		@Query('organizationId') organizationId: string,
		@Res() res: ServerResponse
	) {
		const [icon, mimetype] = await this.queryBus.execute(
			new AIModelGetIconQuery(provider, iconType, lang, organizationId)
		)

		if (!icon) {
			throw new HttpException('Icon not found', HttpStatus.NOT_FOUND)
		}

		res.setHeader('Content-Type', mimetype)
		res.end(icon)
	}
}
