import { CompiledStateGraph } from '@langchain/langgraph'
import { IXpertAgent } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { CompileGraphCommand } from '../../../xpert-agent/commands'
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
		// Agent & Graph
		const { graph, agent } = await this.commandBus.execute<
			CompileGraphCommand,
			{ graph: CompiledStateGraph<unknown, unknown>; agent: IXpertAgent }
		>(
			new CompileGraphCommand(agentKey ?? xpert.agent.key, xpert, {
				isDraft,
				mute: [],
				store: null,
				rootController: controller,
				signal: controller.signal,
				execution: {},
				subscriber: null
			})
		)

		const _graph = await graph.getGraphAsync()
		return await _graph.drawMermaidPng()
	}
}
