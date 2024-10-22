import { tool } from '@langchain/core/tools'
import { IXpert, IXpertAgent } from '@metad/contracts'
import { CommandBus, ICommand } from '@nestjs/cqrs'
import { lastValueFrom, reduce } from 'rxjs'
import { z } from 'zod'

export class XpertAgentExecuteCommand implements ICommand {
	static readonly type = '[Xpert Agent] Execute'

	constructor(
		public readonly input: string,
		public readonly agentKey: string,
		public readonly xpert: IXpert
	) {}
}

export function createXpertAgentTool(commandBus: CommandBus, config: { xpert: IXpert; agent: IXpertAgent }) {
	const { agent, xpert } = config
	console.log(agent.key, ':', agent.description)
	return tool(
		async (args, config) => {
			const obs = await commandBus.execute(new XpertAgentExecuteCommand(args.input, agent.key, xpert))
			// 
			return await lastValueFrom(obs.pipe(reduce((acc, val) => acc + val, '')))
		},
		{
			name: agent.key,
			description: agent.description,
			schema: z.object({
				input: z.string().describe('user input message')
			})
		}
	)
}
