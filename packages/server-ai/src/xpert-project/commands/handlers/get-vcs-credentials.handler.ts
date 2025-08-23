import { IntegrationEnum, TGithubAuth } from '@metad/contracts'
import { CACHE_MANAGER, Inject, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { Cache } from 'cache-manager'
import { differenceInSeconds, parseISO } from 'date-fns'
import { getGitHubInstallationTokenOrThrow } from '../../../integration-github'
import { XpertProjectService } from '../../project.service'
import { GetVcsCredentialsCommand } from '../get-vcs-credentials.command'

@CommandHandler(GetVcsCredentialsCommand)
export class GetVcsCredentialsHandler implements ICommandHandler<GetVcsCredentialsCommand> {
	readonly #logger = new Logger(GetVcsCredentialsHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly service: XpertProjectService,
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache
	) {}

	public async execute(command: GetVcsCredentialsCommand) {
		const { projectId } = command

		const project = await this.service.findOne(projectId, { relations: ['vcs', 'vcs.integration'] })

		if (project.vcs?.integration) {
			if (project.vcs.integration.provider === IntegrationEnum.GITHUB) {
				const cacheKey = `integration:vcs_${project.vcs.id}:github_installation_token`
				let installation_token = await this.cacheManager.get<string>(cacheKey)
				if (!installation_token) {
					const tokenData = await getGitHubInstallationTokenOrThrow(
						project.vcs.integration,
						project.vcs.installationId as string
					)

					const expiresAt = parseISO(tokenData.expires_at)
					const now = new Date()
					const ttlSeconds = differenceInSeconds(expiresAt, now)

					if (ttlSeconds <= 0) {
						this.#logger.warn('Token is already expired')
						return {}
					}

					installation_token = tokenData.token
					// Store token in Redis with TTL
					await this.cacheManager.set(cacheKey, installation_token, 1000 * ttlSeconds)
				}

				return {
					[project.vcs.integrationId]: {
						...(project.vcs.auth ?? {}),
						installation_token
					} as TGithubAuth
				}
			}
		}

		return {}
	}
}
