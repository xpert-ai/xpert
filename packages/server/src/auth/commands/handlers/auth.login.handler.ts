import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { IAuthResponse, IUserLoginInput } from '@xpert-ai/contracts'
import { AuthService } from '../../auth.service'
import { AuthLoginCommand } from '../auth.login.command'

@CommandHandler(AuthLoginCommand)
export class AuthLoginHandler implements ICommandHandler<AuthLoginCommand> {
	constructor(private readonly authService: AuthService) {}

	public async execute(command: AuthLoginCommand): Promise<IAuthResponse> {
		const { input } = command
		const { email, password }: IUserLoginInput = input

		return await this.authService.login(email, password)
	}
}
