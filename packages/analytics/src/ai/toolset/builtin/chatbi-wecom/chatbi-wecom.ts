import { IXpertToolset } from '@metad/contracts'
import { TBuiltinToolsetParams } from '@metad/server-ai'
import { AbstractChatBIToolset } from '../chatbi/chatbi-toolset'

export class ChatBIWeComToolset extends AbstractChatBIToolset {
	static provider = 'chatbi-wecom'

	constructor(
		protected toolset: IXpertToolset,
		params: TBuiltinToolsetParams
	) {
		super(ChatBIWeComToolset.provider, toolset, params)
	}

	async initTools() {
		await super.initTools()

		const tools = this.toolset.tools.filter((_) => !(_.disabled ?? !_.enabled))
		return this.tools
	}
}
