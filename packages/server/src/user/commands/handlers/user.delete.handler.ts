import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { UserDeleteCommand } from './../user.delete.command'
import { UserService } from './../../user.service'

@CommandHandler(UserDeleteCommand)
export class UserDeleteHandler
	implements ICommandHandler<UserDeleteCommand> {
	constructor(private readonly userService: UserService) {}

	public async execute(command: UserDeleteCommand): Promise<any> {
		const { userId } = command
		return this.userService.deleteWithGuards(userId)
	}
}
