import { IXpert, LongTermMemoryTypeEnum, mapTranslationLanguage, replaceAgentInDraft, TXpertTeamDraft } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { BadRequestException, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import {t} from 'i18next'
import { groupBy, omit, pick } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import { XpertAgentService } from '../../../xpert-agent'
import { XpertNameInvalidException } from '../../types'
import { XpertService } from '../../xpert.service'
import { XpertImportCommand } from '../import.command'
import { XpertDraftDslDTO } from '../../dto'

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
		let draft = command.draft as XpertDraftDslDTO

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
				...omit(draft, 'memories'),
				team: xpert
			},
			graph: pick(draft, 'connections', 'nodes')
		})

		// Memories
		if (draft.memories?.length) {
			const items = groupBy(draft.memories.map((item) => {
				const namespace = item.prefix.split(':')
				return {
					type: namespace[namespace.length - 1] as LongTermMemoryTypeEnum,
					value: item.value
				}
			}), 'type')
			await Promise.all(
				Object.keys(items).filter((name) => !!name && items[name].length).map((type: LongTermMemoryTypeEnum) => {
					const memories = items[type].map((_) => _.value)
					return this.xpertService.createBulkMemories(xpert.id, {
						type,
						memories
					})
				})
			)
		}

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
