import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { IsNull, MoreThan, Not } from 'typeorm'
import { PasswordResetGetCommand } from '../password-reset.get.command'
import { PasswordResetService } from '../../password-reset.service'
import { PasswordReset } from '../../password-reset.entity'
import { invalidResetLink, resetTokenLifetimeMs } from '../../reset-token'

@CommandHandler(PasswordResetGetCommand)
export class PasswordResetGetHandler implements ICommandHandler<PasswordResetGetCommand> {
	constructor(private readonly resets: PasswordResetService) {}

	async execute({ digest }: PasswordResetGetCommand): Promise<PasswordReset> {
		const ticket = await this.resets.findOneByOptions({
			where: {
				token: digest,
				userId: Not(IsNull()),
				createdAt: MoreThan(new Date(Date.now() - resetTokenLifetimeMs))
			}
		})
		if (!ticket?.userId) throw invalidResetLink()
		return ticket
	}
}
