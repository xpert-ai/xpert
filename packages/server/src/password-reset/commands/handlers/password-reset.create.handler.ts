import { issueResetToken, tokenDigest } from '../../reset-token'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { PasswordResetCreateCommand } from './../password-reset.create.command'
import { PasswordResetService } from './../../password-reset.service'

@CommandHandler(PasswordResetCreateCommand)
export class PasswordResetCreateHandler implements ICommandHandler<PasswordResetCreateCommand> {
	constructor(private readonly _passwordResetService: PasswordResetService) {}

	public async execute(command: PasswordResetCreateCommand) {
		const { input } = command
		const { email, userId, tenantId } = input
		const token = issueResetToken()

		await this._passwordResetService.create({ email, userId, tenantId, token: tokenDigest(token) })
		return token
	}
}
