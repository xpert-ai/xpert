import { IKnowledgebase, IXpert, IXpertAgent, IXpertToolset, TXpertTeamDraft, TXpertTeamNode } from '@metad/contracts'
import { omit, pick } from '@metad/server-common'
import { BadRequestException, HttpException, Logger, NotFoundException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { groupBy, uniq } from 'lodash'
import { IsNull } from 'typeorm'
import { Xpert } from '../../xpert.entity'
import { XpertService } from '../../xpert.service'
import { XpertPublishCommand } from '../publish.command'
import { XpertAgentService } from '../../../xpert-agent'

@CommandHandler(XpertPublishCommand)
export class XpertPublishHandler implements ICommandHandler<XpertPublishCommand> {
	readonly #logger = new Logger(XpertPublishHandler.name)

	constructor(
		// @InjectRepository(Xpert)
		// private readonly repository: Repository<Xpert>,
		private readonly xpertService: XpertService,
		private readonly xpertAgentService: XpertAgentService,
	) {}

	public async execute(command: XpertPublishCommand): Promise<Xpert> {
		const id = command.id
		const xpert = await this.xpertService.findOne(id, { relations: ['agent', 'copilotModel', 'agents', 'agents.copilotModel', 'knowledgebases', 'toolsets'] })

		if (!xpert.draft) {
			throw new NotFoundException(`No draft found on Xpert '${xpert.name}'`)
		}

		this.#logger.verbose(`Draft of xpert '${xpert.name}':\n${JSON.stringify(xpert.draft, null, 2)}`)

		const { items: allVersionXperts } = await this.xpertService.findAll({
			where: {
				workspaceId: xpert.workspaceId ?? IsNull(),
				name: xpert.name
			}
		})

		const allVersions = allVersionXperts.map((_) => _.version)

		if (allVersionXperts.length === 1) {
			xpert.latest = true
		}

		const currentVersion = xpert.version
		let version = null
		if (currentVersion) {
			const versions = currentVersion.split('.')
			versions[versions.length - 1] = `${Number(versions[versions.length - 1]) + 1}`
			version = versions.join('.')
			let index = 0
			while (allVersions.includes(version)) {
				index++
				version = currentVersion + '.' + index
			}
		} else {
			// 初始没有版本，直接保存
			version = '1'
		}

		// Check
		const draft = xpert.draft
		this.check(draft)

		// // await this.repository.queryRunner.connect()
		// // await this.repository.queryRunner.startTransaction()
		// // try {
			// Back up the current version
			if (currentVersion) {
				await this.saveTeamVersion(xpert, version)
			}

			return await this.publish(xpert, version, draft)
		// 	// await this.repository.queryRunner.commitTransaction()
		// // } catch (err) {
		// 	// since we have errors lets rollback the changes we made
		// 	// await this.repository.queryRunner.rollbackTransaction()
		// // } finally {
		// 	// you need to release a queryRunner which was manually instantiated
		// 	// await this.repository.queryRunner.release()
		// // }

		// return null		
	}

	/**
	 * Backup current version
	 * 
	 * @param team Team (leader)
	 * @param version New version
	 */
	async saveTeamVersion(team: Xpert, version: string) {
		const oldTeam: IXpert = {
			...omit(team, 'id', 'copilotModelId'),
			latest: false,
			draft: null,
			agent: null,
			agents: null,
			copilotModel: team.copilotModel ? omit(team.copilotModel, 'id') : null
		}

		// Update to new version, leaving space for the old version as a backup
		team.version = version
		await this.xpertService.save(team)
		// backup old version
		const newTeam = await this.xpertService.create(oldTeam)

		// Copy all agents
		for await (const agent of team.agents) {
			await this.xpertAgentService.create({
				...omit(agent, 'id', 'copilotModelId'),
				teamId: newTeam.id,
				copilotModel: agent.copilotModel ? omit(agent.copilotModel, 'id') : null
			})
		}
		await this.xpertAgentService.create({
			...omit(team.agent, 'id', 'copilotModelId'),
			xpertId: newTeam.id,
			copilotModel: team.agent.copilotModel ? omit(team.agent.copilotModel, 'id') : null
		})
	}

	/**
	 * Publish draft of team to new version
	 * 
	 * @param xpert Xpert
	 * @param version New version
	 * @param draft Xpert draft
	 */
    async publish(xpert: Xpert, version: string, draft: TXpertTeamDraft) {
		this.#logger.debug(`Publish Xpert '${xpert.name}' to new version '${version}'`)

		const xpertOptions = draft.team?.options ?? xpert.options ?? {}

		const oldAgents = xpert.agents

		// CURD Agents
		if (draft.nodes) {
			const newAgents = []
			const agentNodes = draft.nodes.filter((node) => node.type === 'agent') as (TXpertTeamNode & {type: 'agent'})[]
			const xpertNodes = draft.nodes.filter((node) => node.type === 'xpert') as (TXpertTeamNode & {type: 'xpert'})[]
			const totalToolsetIds = []
			const totalKnowledgebaseIds = []
			const totalXpertIds = []
			for await (const node of agentNodes) {
				// Collect toolsetIds
				const toolsetIds = draft.connections.filter((_) => _.type === 'toolset' && _.from === node.key).map((_) => _.to)
				const knowledgebaseIds = draft.connections.filter((_) => _.type === 'knowledge' && _.from === node.key).map((_) => _.to)
				const xpertIds = draft.connections.filter((_) => _.type === 'xpert' && _.from === node.key).map((_) => _.to)
				totalToolsetIds.push(...toolsetIds)
				totalKnowledgebaseIds.push(...knowledgebaseIds)
				totalXpertIds.push(...xpertIds)
				const collaboratorNames = xpertIds.map((id) => xpertNodes.find((_) => _.key === id)?.entity.name).filter(Boolean)

				const oldAgent = oldAgents.find((item) => item.key === node.key)
				// Calc the leader of agent
				const conn = draft.connections.find((_) => _.type === 'agent' && _.to === node.key)
				
				if (oldAgent) {
					if (oldAgent.updatedAt.toISOString() > `${node.entity.updatedAt}`) {
						throw new BadRequestException(`Agent record has been updated, please resynchronize`)
					} else {
						// Update xpert agent
						const entity = {
							...pickXpertAgent(node.entity),
							leaderKey: conn?.from,
							toolsetIds,
							knowledgebaseIds,
							collaboratorNames,

						}
						this.#logger.verbose(`Update xpert team agent (name/key='${oldAgent.name || oldAgent.key}', id='${oldAgent.id}') with value:\n${JSON.stringify(entity, null, 2)}`)
						await this.xpertAgentService.update(oldAgent.id, entity)
					}
					newAgents.push(oldAgent)
				} else if (node.key === xpert.agent.key) {
					if (xpert.agent.updatedAt.toISOString() > `${node.entity.updatedAt}`) {
						throw new BadRequestException(`Agent record has been updated, please resynchronize`)
					}
					// Update primary agent (save the relation updates in agent) before update xpert
					xpert.agent = await this.xpertAgentService.update(xpert.agent.id, {
						...xpert.agent,
						...pickXpertAgent(node.entity),
						toolsetIds,
						knowledgebaseIds,
						collaboratorNames
					})
				} else {
					// Create new xpert agent
					const newAgent = await this.xpertAgentService.create({
						key: node.key,
						...pickXpertAgent(node.entity),
						tenantId: xpert.tenantId,
						organizationId: xpert.organizationId,
						teamId: xpert.id,
						leaderKey: conn?.from,
						toolsetIds,
						knowledgebaseIds,
						collaboratorNames
					})
					newAgents.push(newAgent)
				}
			}

			// Delete unused agents
			for await (const agent of oldAgents) {
				if (!newAgents.some((_) => _.id === agent.id)) {
					await this.xpertAgentService.delete(agent.id)
				}
			}

			// Update agents relative info
			xpert.agents = newAgents
			xpert.toolsets = uniq(totalToolsetIds).map((id) => ({id} as IXpertToolset))
			xpert.knowledgebases = uniq(totalKnowledgebaseIds).map((id) => ({id} as IKnowledgebase))
			xpert.executors = uniq(totalXpertIds).map((id) => ({id} as IXpert))
			// Recording graph node positions
			xpert.options ??= {}
			draft.nodes.forEach((node) => {
				xpertOptions[node.type] ??= {}
				xpertOptions[node.type][node.key] ??= {}
				xpertOptions[node.type][node.key].position = node.position
				xpertOptions[node.type][node.key].size = node.size
			})
		}

		// Update basic info
		if (draft.team) {
			xpert.title = draft.team.title
			xpert.titleCN = draft.team.titleCN
			xpert.description = draft.team.description
			xpert.avatar = draft.team.avatar
			xpert.starters = draft.team.starters
			xpert.tags = draft.team.tags?.map((t) => ({id: t.id}))
			xpert.copilotModel = draft.team.copilotModel
			xpert.agentConfig = draft.team.agentConfig
			xpert.memory = draft.team.memory
			xpert.summarize = draft.team.summarize
			xpert.options = xpertOptions
		}

		// Update new version
		xpert.version = version
		xpert.draft = null
		xpert.publishAt = new Date()
		xpert.active = true

		return await this.xpertService.save(xpert)
	}

	check(draft: TXpertTeamDraft) {
		// Check all nodes have been connected
		if (draft.nodes?.length > 1) {
			draft.nodes.forEach((node) => {
				if (!draft.connections.some((connection) => connection.from === node.key || connection.to === node.key)) {
					throw new HttpException(`There are free Xpert agents!`, 500)
				}
			})
			const nameGroups = groupBy(draft.nodes.filter((_) => _.type !== 'workflow' && _.entity.name).map(({entity}) => entity), 'name')
			const names = Object.entries(nameGroups).map(([name, nodes]) => [name, nodes.length]).filter(([, length]: [string, number]) => length > 1)
			if (names.length) {
				throw new HttpException(`There are the following duplicate names: ${names}`, 500)
			}
		}
	}
}

/**
 * Select the properties of agent to update or create from the draft
 * 
 * @param agent Draft
 * @returns 
 */
export function pickXpertAgent(agent: Partial<IXpertAgent>) {
  return pick(
	agent,
	'name',
	'title',
	'description',
	'avatar',
	'prompt',
	'parameters',
	'options',
	'leaderKey', // todo
	'collaboratorNames',
	'toolsetIds',
	'knowledgebaseIds',
	'copilotModel'
  )
}