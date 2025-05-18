import { Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { DeleteResult, Not } from 'typeorm'
import { XpertService } from '../../xpert.service'
import { XpertDeleteCommand } from '../delete.command'

@CommandHandler(XpertDeleteCommand)
export class XpertDeleteHandler implements ICommandHandler<XpertDeleteCommand> {
	readonly #logger = new Logger(XpertDeleteHandler.name)

	constructor(
		private readonly service: XpertService,
		private readonly i18n: I18nService
	) {}

	public async execute(command: XpertDeleteCommand): Promise<DeleteResult> {
		const id = command.id

		const xpert = await this.service.findOne(id)
		if (xpert.latest) {
			const others = await this.service.findAll({
				where: {
					type: xpert.type,
					slug: xpert.slug,
					id: Not(xpert.id)
				}
			})

			await this.service.repository.remove(others.items)
		}

		return await this.service.delete(id)
	}
}
