import {
	createAgentConnections,
	createXpertNodes,
	IXpert,
	TXpertTeamConnection,
	TXpertTeamDraft
} from '@metad/contracts'
import { omit, yaml } from '@metad/server-common'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { instanceToPlain } from 'class-transformer'
import { XpertDraftDslDTO } from '../../dto'
import { XpertService } from '../../xpert.service'
import { XpertExportCommand } from '../export.command'

/**
 */
@CommandHandler(XpertExportCommand)
export class XpertExportHandler implements ICommandHandler<XpertExportCommand> {
	readonly #logger = new Logger(XpertExportHandler.name)

	constructor(
		private readonly xpertService: XpertService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertExportCommand): Promise<{ data: string }> {
		const { id, isDraft } = command

		const relations = isDraft === 'true' ? [] : [
			'agent',
			'agent.copilotModel',
			'agents',
			'agents.copilotModel',
			'executors',
			'executors.agent',
			'executors.copilotModel',
			'copilotModel',
			'toolsets',
			'toolsets.tools',
			'knowledgebases'
		]
		const xpert = await this.xpertService.findOne(id, {relations})

		const draft = isDraft === 'true' ? xpert.draft : this.getInitialDraft(xpert)
		const result = yaml.stringify(instanceToPlain(new XpertDraftDslDTO(draft)))

		return {
			data: result
		}
	}

	getInitialDraft(xpert: IXpert) {
		return {
			team: {
				...omit(xpert, 'agents'),
				id: xpert.id
			},
			nodes: createXpertNodes(xpert, { x: 0, y: 0 }).nodes,
			connections: this.makeConnections(xpert)
		} as TXpertTeamDraft
	}

	makeConnections(xpert: IXpert): TXpertTeamConnection[] {
		const connections: TXpertTeamConnection[] = []

		connections.push(...createAgentConnections(xpert.agent, xpert.executors))
		for (const agent of xpert.agents ?? []) {
			connections.push(...createAgentConnections(agent, xpert.executors))
		}

		return connections
	}
}
