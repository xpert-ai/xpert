import { BusinessType, IFavorite } from '@xpert-ai/contracts'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { IsNull } from 'typeorm'
import { FavoriteService } from '../../favorite.service'
import { BookmarkGetCommand } from '../bookmark-get.command'

@CommandHandler(BookmarkGetCommand)
export class BookmarkGetHandler implements ICommandHandler<BookmarkGetCommand> {
	constructor(private readonly commandBus: CommandBus, private readonly favoriteService: FavoriteService) {}

	public async execute(command: BookmarkGetCommand): Promise<IFavorite[]> {
		const { type, entity, project } = command.input

		if (type === BusinessType.STORY) {
			const { items: bookmarks } = await this.favoriteService.my({
				where: {
					storyId: entity,
					projectId: project ? project : IsNull()
				}
			})

			return bookmarks
		}
	}
}
