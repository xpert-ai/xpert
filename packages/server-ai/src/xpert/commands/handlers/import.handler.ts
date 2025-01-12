import { IXpert, IXpertAgent, mapTranslationLanguage } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { omit } from 'lodash'
import { I18nService } from 'nestjs-i18n';
import { XpertAgentService } from '../../../xpert-agent'
import { XpertService } from '../../xpert.service'
import { XpertImportCommand } from '../import.command'
import { pickXpertAgent } from './publish.handler'
import { XpertNameInvalidException } from '../../types'
import { RequestContext } from '@metad/server-core';

/**
 * @todo add import toolsets and knowledgebases
 */
@CommandHandler(XpertImportCommand)
export class XpertImportHandler implements ICommandHandler<XpertImportCommand> {
	readonly #logger = new Logger(XpertImportHandler.name)

	constructor(
		private readonly xpertService: XpertService,
		private readonly agentService: XpertAgentService,
		private readonly i18n: I18nService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertImportCommand): Promise<IXpert> {
		const { draft } = command

		// Check if the name is unique
		const team = draft.team
		const valid = await this.xpertService.validateName(team.name)
		if (!valid) {
			throw new XpertNameInvalidException(
				await this.i18n.t('xpert.Error.NameInvalid', {lang: mapTranslationLanguage(RequestContext.getLanguageCode())})
			)
		}

		const xpert = await this.xpertService.create({
			...omit(draft.team, 'agent'),
			latest: true,
			version: '0'
		})

		const xpertAgents = await Promise.all(
			draft.nodes
				.filter((node) => node.type === 'agent')
				.map(async (node) => {
					return await this.agentService.create({
						key: node.key,
						...pickXpertAgent(node.entity as Partial<IXpertAgent>),
						teamId: node.key === draft.team.agent.key ? null : xpert.id, // is xpert team's member
						xpertId: node.key === draft.team.agent.key ? xpert.id : null // is primary agent
					})
				})
		)

		// Establish connections between agents based on draft connections
		for (const connection of draft.connections) {
			const fromAgent = xpertAgents.find((agent) => agent.key === connection.from)
			const toAgent = xpertAgents.find((agent) => agent.key === connection.to)
			if (fromAgent && toAgent) {
				await this.createConnection(toAgent.id, fromAgent.key)
			}
		}

		return xpert
	}

	async createConnection(id: string, leaderKey: string) {
		await this.agentService.update(id, { leaderKey })
	}
}
