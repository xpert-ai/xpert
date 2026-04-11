import { Controller, Get, Query } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { IFavorite, IPagination } from '@xpert-ai/contracts'
import { CrudController, ParseJsonPipe } from '@xpert-ai/server-core'
import { FindManyOptions } from 'typeorm'
import { Favorite } from './favorite.entity'
import { FavoriteService } from './favorite.service'


@ApiTags('Favorite')
@ApiBearerAuth()
@Controller()
export class FavoriteController extends CrudController<Favorite> {
	constructor(
		private readonly favService: FavoriteService,
		private readonly commandBus: CommandBus
	) {
		super(favService)
	}

	@Get()
	async my(@Query('$query', ParseJsonPipe) data: FindManyOptions): Promise<IPagination<IFavorite>> {
		const { relations, where } = data
		return await this.favService.my({
			where,
			relations,
		})
	}
}
