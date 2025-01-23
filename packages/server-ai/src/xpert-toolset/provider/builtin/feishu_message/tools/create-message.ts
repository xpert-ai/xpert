import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { LangGraphRunnableConfig } from '@langchain/langgraph'
import * as lark from '@larksuiteoapi/node-sdk'
import { Logger } from '@nestjs/common'
import z from 'zod'
import { LarkMessage } from '../../../../../integration-lark'
import { ToolParameterValidationError } from '../../../../errors'
import { BuiltinTool } from '../../builtin-tool'
import { FeishuMessageToolset } from '../feishu_message'
import { FeishuToolEnum } from '../types'

export type TCreateMessageToolParameters = {
	content: string
}

export class CreateMessageTool extends BuiltinTool {
	readonly #logger = new Logger(CreateMessageTool.name)

	static lc_name(): string {
		return FeishuToolEnum.CREATE_MESSAGE
	}
	name = FeishuToolEnum.CREATE_MESSAGE
	description = 'A tool for creating a feishu message'

	schema = z.object({
		content: z.string().describe(`task name`)
	})

	constructor(private toolset: FeishuMessageToolset) {
		super()
	}

	async _call(
		parameters: TCreateMessageToolParameters,
		callbacks: CallbackManagerForToolRun,
		config: LangGraphRunnableConfig
	) {
		if (!parameters.content) {
			throw new ToolParameterValidationError(`content is empty`)
		}

		const { subscriber } = config?.configurable ?? {}
		const client = await this.toolset.getClient()

		const toolsetCredentials = this.toolset.getCredentials()
		if (toolsetCredentials.chat) {
			await this.createMessage(client, 'chat_id', toolsetCredentials.chat, parameters.content)
		}
		if (toolsetCredentials.user) {
			await this.createMessage(client, 'union_id', toolsetCredentials.user, parameters.content)
		}

		return 'Message send!'
	}

	async createMessage(client: lark.Client, type: 'chat_id' | 'union_id', id: string, content: string) {
		const message: LarkMessage = {
			data: {
				receive_id: id,
				msg_type: 'post',
				content: JSON.stringify({
					en_us: {
						content: [
							[
								{
									tag: 'md',
									text: content
								}
							]
						]
					}
				})
			},
			params: {
				receive_id_type: type
			}
		}

		await client.im.message.create(message)
	}
}
