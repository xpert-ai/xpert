import { Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Xpert } from '../../xpert.entity'
import { XpertService } from '../../xpert.service'
import { XpertCreateCommand } from '../create.command'

@CommandHandler(XpertCreateCommand)
export class XpertCreateHandler implements ICommandHandler<XpertCreateCommand> {
	readonly #logger = new Logger(XpertCreateHandler.name)

	constructor(private readonly roleService: XpertService) {}

	public async execute(command: XpertCreateCommand): Promise<Xpert> {
		const entity = command.input
		const result = await this.roleService.findOneOrFailByWhereOptions({ name: entity.name })
		if (result.success) {
			throw new Error(`Xpert with name ${entity.name} already exists`)
		}

		return await this.roleService.create(entity)
	}
}
