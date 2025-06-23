import { IXpert, mapTranslationLanguage, replaceAgentInDraft, TXpertTeamDraft } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { BadRequestException, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import {t} from 'i18next'
import { omit, pick } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import { XpertAgentService } from '../../../xpert-agent'
import { XpertNameInvalidException } from '../../types'
import { XpertService } from '../../xpert.service'
import { XpertImportCommand } from '../import.command'

const SYSTEM_FIELDS = ['tenantId', 'organizationId', 'id', 'createdById', 'updatedById']

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
		let { draft } = command

		// Check if the name is unique
		const team = draft.team
		const valid = await this.xpertService.validateName(team.name)
		if (!valid) {
			throw new XpertNameInvalidException(
				await this.i18n.t('xpert.Error.NameInvalid', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode())
				})
			)
		}

		if (!draft.team.agent) {
			throw new BadRequestException(t('server-ai:Error.PrimaryAgentNotFound'))
		}

		const xpert = await this.xpertService.create({
			...omit(draft.team, 'draft', 'agent', 'agents', 'toolsets', 'knowledgebases', ...SYSTEM_FIELDS),
			latest: true,
			version: null,
			agent: omit(getLatestPrimaryAgent(draft, draft.team.agent.key), ...SYSTEM_FIELDS)
		})

		// Replace agent in draft
		draft = replaceAgentInDraft(draft, draft.team.agent.key, xpert.agent)

		// Update draft into xpert
		await this.xpertService.update(xpert.id, {
			draft: {
				...draft,
				team: xpert
			},
			graph: pick(draft, 'connections', 'nodes')
		})

		// const xpertAgents = await Promise.all(
		// 	draft.nodes
		// 		.filter((node) => node.type === 'agent')
		// 		.map(async (node) => {
		// 			return await this.agentService.create({
		// 				key: node.key,
		// 				...pickXpertAgent(node.entity as Partial<IXpertAgent>),
		// 				teamId: node.key === draft.team.agent.key ? null : xpert.id, // is xpert team's member
		// 				xpertId: node.key === draft.team.agent.key ? xpert.id : null // is primary agent
		// 			})
		// 		})
		// )

		// Establish connections between agents based on draft connections
		// for (const connection of draft.connections) {
		// 	const fromAgent = xpertAgents.find((agent) => agent.key === connection.from)
		// 	const toAgent = xpertAgents.find((agent) => agent.key === connection.to)
		// 	if (fromAgent && toAgent) {
		// 		await this.createConnection(toAgent.id, fromAgent.key)
		// 	}
		// }

		return xpert
	}

	async createConnection(id: string, leaderKey: string) {
		await this.agentService.update(id, { leaderKey })
	}
}

function getLatestPrimaryAgent(draft: TXpertTeamDraft, key: string) {
	const index = draft.nodes.findIndex((_) => _.type === 'agent' && _.key === key)
	if (index > -1) {
		return draft.nodes[index].entity
	} else {
		throw new Error(t('server-ai:Error.AgentNotFound', {key}))
	}
}
