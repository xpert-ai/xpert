import { IRole, IUser, mapTranslationLanguage } from '@xpert-ai/contracts'
import { ConfigService } from '@xpert-ai/server-config'
import { BadRequestException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { uniq } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import { In } from 'typeorm'
import { RequestContext } from '../../../core/context/request-context'
import { RoleService } from '../../../role'
import { UserOrganizationCreateCommand } from '../../../user-organization/commands'
import { UserService } from '../../user.service'
import { UserBulkCreateCommand } from '../user.bulk.create.command'
import { UserCreateCommand } from '../user.create.command'

@CommandHandler(UserBulkCreateCommand)
export class UserBulkCreateHandler implements ICommandHandler<UserBulkCreateCommand> {
	protected readonly configService: ConfigService
	protected readonly saltRounds: number

	constructor(
		private readonly commandBus: CommandBus,
		private readonly userService: UserService,
		private readonly roleService: RoleService,
		private readonly i18n: I18nService
	) {}

	public async execute(command: UserBulkCreateCommand): Promise<IUser[]> {
		const { input } = command
		const organizationId = RequestContext.getOrganizationId()
		const normalizeRoleName = (value: unknown): string | null => {
			if (typeof value === 'string') {
				const normalized = value.trim()
				return normalized || null
			}

			if (typeof value === 'number') {
				const normalized = String(value).trim()
				return normalized || null
			}

			return null
		}

		const users = []
		if (input.length) {
			let roles: IRole[] = []
			const roleNames = uniq(
				input
					.map((user) => normalizeRoleName(user.roleName))
					.filter((value): value is string => Boolean(value))
			)
			if (roleNames.length) {
				roles = (
					await this.roleService.findAll({
						where: {
							name: In(roleNames)
						}
					})
				).items
			}
			// Check
			for await (const user of input) {
				const exist = await this.userService.getIfExistsUser(user)
				if (exist) {
					throw new BadRequestException(
						(await this.i18n.translate('core.User.Error.AccountAlreadyExists', {
							lang: mapTranslationLanguage(RequestContext.getLanguageCode())
						})) +
							exist.email +
							' ' +
							exist.username
					)
				}
			}

			for await (const user of input) {
				const roleName = normalizeRoleName(user.roleName)
				if (roleName) {
					user.roleName = roleName
					user.role = roles.find((item) => item.name === roleName)
					if (!user.role) {
						throw new BadRequestException(
							(await this.i18n.translate('core.User.Error.RoleError', {
								lang: mapTranslationLanguage(RequestContext.getLanguageCode())
							})) + roleName
						)
					}
				}
				const nUser = await this.commandBus.execute(new UserCreateCommand(user))
				if (organizationId) {
					await this.commandBus.execute(new UserOrganizationCreateCommand(nUser, organizationId))
				}
				users.push(nUser)
			}
		}

		return users
	}
}
