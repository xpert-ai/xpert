import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ISecretToken } from '@metad/contracts';
import { SecretTokenGetCommand } from '../secret-token.get.command';
import { SecretTokenService } from '../../secret-token.service';

@CommandHandler(SecretTokenGetCommand)
export class SecretTokenGetHandler
	implements ICommandHandler<SecretTokenGetCommand> {
	
	constructor(
		private readonly _stService : SecretTokenService
	) {}

	public async execute(
		command: SecretTokenGetCommand
	): Promise<ISecretToken> {
		const { input } = command;
		const { token } = input;

		try {
			return await this._stService.findOneByOptions({
				where: { token },
				order: {
					createdAt: 'DESC'
				}
			});
		} catch (error) {
			throw new NotFoundException(error);
		}
	}
}
