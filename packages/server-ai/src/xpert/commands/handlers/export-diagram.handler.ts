import { CompiledStateGraph } from '@langchain/langgraph'
import { channelName } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { XpertAgentSubgraphCommand } from '../../../xpert-agent'
import { XpertService } from '../../xpert.service'
import { XpertExportDiagramCommand } from '../export-diagram.command'

@CommandHandler(XpertExportDiagramCommand)
export class XpertExportDiagramHandler implements ICommandHandler<XpertExportDiagramCommand> {
	readonly #logger = new Logger(XpertExportDiagramHandler.name)

	constructor(
		private readonly xpertService: XpertService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertExportDiagramCommand): Promise<Blob> {
		const { id, isDraft, agentKey } = command
		const xpert = await this.xpertService.findOne(id, { relations: ['agent'] })

		// Create graph by command
		const controller = new AbortController()
		const { graph } = await this.commandBus.execute<
			XpertAgentSubgraphCommand,
			{
				graph: CompiledStateGraph<unknown, unknown>
			}
		>(
			new XpertAgentSubgraphCommand(agentKey ?? xpert.agent.key, xpert, {
				isDraft,
				isStart: true,
				execution: {},
				rootController: controller,
				signal: controller.signal,
				channel: channelName(agentKey ?? xpert.agent.key)
			})
		)
		const _graph = await graph.getGraphAsync()
		return await _graph.drawMermaidPng()
	}
}
