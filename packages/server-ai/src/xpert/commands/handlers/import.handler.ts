import {
	convertToUrlPath,
	IXpert,
	IXpertAgent,
	LongTermMemoryTypeEnum,
	mapTranslationLanguage,
	omitXpertRelations,
	replaceAgentInDraft,
	TXpertTeamDraft
} from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { BadRequestException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { t } from 'i18next'
import { groupBy, omit } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import { XpertNameInvalidException } from '../../types'
import { XpertService } from '../../xpert.service'
import { XpertDraftDslDTO } from '../../dto'
import { XpertImportCommand } from '../import.command'

const SYSTEM_FIELDS = ['tenantId', 'organizationId', 'id', 'createdById', 'updatedById']
const OVERWRITE_PROTECTED_TEAM_FIELDS = [
	...SYSTEM_FIELDS,
	'createdAt',
	'updatedAt',
	'workspaceId',
	'type',
	'agent',
	'slug',
	'latest',
	'version',
	'publishAt'
]
const OVERWRITE_PROTECTED_AGENT_FIELDS = [
	...SYSTEM_FIELDS,
	'createdAt',
	'updatedAt',
	'xpertId',
	'key'
]

/**
 * @todo add import toolsets and knowledgebases
 */
@CommandHandler(XpertImportCommand)
export class XpertImportHandler implements ICommandHandler<XpertImportCommand> {
	constructor(
		private readonly xpertService: XpertService,
		private readonly i18n: I18nService
	) {}

	public async execute(command: XpertImportCommand): Promise<IXpert> {
		const draft = command.draft as XpertDraftDslDTO
		if (!draft?.team) {
			throw new BadRequestException(t('server-ai:Error.PrimaryAgentNotFound'))
		}

		if (command.options?.targetXpertId) {
			return this.overwriteExistingXpertDraft(command.options.targetXpertId, draft)
		}

		return this.importAsNewXpert(draft)
	}

	private async importAsNewXpert(draft: XpertDraftDslDTO): Promise<IXpert> {
		const team = draft.team
		await this.validateImportedName(team.name)

		if (!team.agent) {
			throw new BadRequestException(t('server-ai:Error.PrimaryAgentNotFound'))
		}

		const xpert = await this.xpertService.create({
			...omit(team, 'draft', 'agent', 'agents', 'toolsets', 'knowledgebases', ...SYSTEM_FIELDS),
			latest: true,
			version: null,
			agent: omit(getLatestPrimaryAgent(draft, team.agent.key), ...SYSTEM_FIELDS)
		})

		let nextDraft = draft as TXpertTeamDraft
		if (!xpert.agent.options?.hidden) {
			nextDraft = replaceAgentInDraft(nextDraft, team.agent.key, xpert.agent)
		}

		await this.xpertService.saveDraft(xpert.id, {
			...omit(nextDraft, 'memories'),
			team: xpert
		})

		if (draft.memories?.length) {
			const items = groupBy(
				draft.memories.map((item) => {
					const namespace = item.prefix.split(':')
					return {
						type: namespace[namespace.length - 1] as LongTermMemoryTypeEnum,
						value: item.value
					}
				}),
				'type'
			)
			await Promise.all(
				Object.keys(items)
					.filter((name) => !!name && items[name].length)
					.map((type: LongTermMemoryTypeEnum) => {
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

	private async overwriteExistingXpertDraft(targetXpertId: string, draft: XpertDraftDslDTO): Promise<IXpert> {
		const currentXpert = await this.loadXpertById(targetXpertId)
		if (draft.team.type !== currentXpert.type) {
			throw new BadRequestException('DSL type does not match the current xpert.')
		}

		if (!currentXpert.agent?.key || !draft.team.agent?.key) {
			throw new BadRequestException(t('server-ai:Error.PrimaryAgentNotFound'))
		}

		await this.validateImportedName(draft.team.name, currentXpert)

		const currentTeam = {
			...omitXpertRelations(currentXpert),
			...(currentXpert.draft?.team ?? {}),
			agent: currentXpert.agent
		} as TXpertTeamDraft['team']

		const importedPrimaryAgent = getLatestPrimaryAgent(draft, draft.team.agent.key)
		const targetPrimaryAgent = {
			...currentXpert.agent,
			...omit(importedPrimaryAgent, ...OVERWRITE_PROTECTED_AGENT_FIELDS),
			key: currentXpert.agent.key
		} as IXpertAgent

		const nextTeam = {
			...currentTeam,
			...omit(draft.team, ...OVERWRITE_PROTECTED_TEAM_FIELDS),
			id: currentTeam.id ?? currentXpert.id,
			workspaceId: currentTeam.workspaceId ?? currentXpert.workspaceId,
			type: currentXpert.type,
			agent: targetPrimaryAgent
		} as TXpertTeamDraft['team']

		const nextDraft = replaceAgentInDraft(
			{
				...(currentXpert.draft ?? {}),
				...omit(draft, 'memories'),
				team: nextTeam,
				nodes: draft.nodes ?? [],
				connections: draft.connections ?? []
			} as TXpertTeamDraft,
			draft.team.agent.key,
			targetPrimaryAgent,
			{ requireNode: false }
		)

		currentXpert.draft = await this.xpertService.saveDraft(currentXpert.id, nextDraft)
		return currentXpert
	}

	private async validateImportedName(name: string, currentXpert?: IXpert) {
		const nextSlug = convertToUrlPath(name)
		if (currentXpert && nextSlug === currentXpert.slug) {
			return
		}

		const valid = await this.xpertService.validateName(name)
		if (!valid) {
			throw new XpertNameInvalidException(
				await this.i18n.t('xpert.Error.NameInvalid', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode())
				})
			)
		}
	}

	private async loadXpertById(xpertId: string) {
		const xpert = await this.xpertService.repository.findOne({
			where: {
				id: xpertId
			},
			relations: ['agent', 'agent.copilotModel', 'copilotModel', 'agents', 'agents.copilotModel', 'toolsets', 'knowledgebases']
		})

		if (!xpert) {
			throw new BadRequestException(`Xpert '${xpertId}' was not found.`)
		}

		return xpert
	}
}

function getLatestPrimaryAgent(draft: TXpertTeamDraft, key: string): IXpertAgent {
	const index = draft.nodes.findIndex((_) => _.type === 'agent' && _.key === key)
	if (index > -1) {
		return draft.nodes[index].entity as IXpertAgent
	} else {
		// This is pure workflow, no primary agent.
		return {
			key,
			options: {
				hidden: true
			}
		}
	}
}
