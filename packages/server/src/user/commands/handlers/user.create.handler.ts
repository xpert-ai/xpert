import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IUser, mapTranslationLanguage } from '@metad/contracts';
import { ConfigService } from '@metad/server-config';
import bcrypt from 'bcryptjs';
import { UserCreateCommand } from '../user.create.command';
import { UserService } from '../../user.service';
import { BadRequestException } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { RequestContext } from '../../../core';

@CommandHandler(UserCreateCommand)
export class UserCreateHandler implements ICommandHandler<UserCreateCommand> {
	protected readonly configService: ConfigService;
	protected readonly saltRounds: number;
	constructor(
		private readonly userService: UserService,
		private readonly i18n: I18nService,
	) {
		this.configService = new ConfigService();
		this.saltRounds = this.configService.get(
			'USER_PASSWORD_BCRYPT_SALT_ROUNDS'
		) as number;
	}

	public async execute(command: UserCreateCommand): Promise<IUser> {
		const { input } = command;
		const normalizedInput = {
			...input,
			email: input.email?.trim().toLowerCase(),
			username: input.username?.trim().toLowerCase()
		}

		const exist = await this.userService.getIfExistsUser(normalizedInput)

		if (exist) {
			throw new BadRequestException(
				await this.i18n.translate(
					'core.User.Error.AccountAlreadyExists',
					{
						lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
					}
				)
			)
		}

		// CSV parsing can coerce numeric passwords into numbers, so normalize before trimming.
		const normalizedPassword =
			typeof input.hash === 'string'
				? input.hash.trim()
				: typeof input.hash === 'number'
					? String(input.hash).trim()
					: ''
		const password = normalizedPassword || '12345678'
		const hash = await this.getPasswordHash(password)

		return await this.userService.create({
			...normalizedInput,
			hash,
			emailVerified: true,
		});
	}

	public async getPasswordHash(password: string): Promise<string> {
		if (!password) {
			throw new BadRequestException('Password is required')
		}
		return bcrypt.hash(password, this.saltRounds);
	}
}
