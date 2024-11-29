import { IXpertToolset, TToolCredentials } from '@metad/contracts'
import { BuiltinToolset } from '../builtin-toolset'

export class DiscordToolset extends BuiltinToolset {
	static provider = 'discord'

	constructor(protected toolset?: IXpertToolset) {
		super(DiscordToolset.provider, toolset)
		if (toolset?.tools) {
			this.tools = []
		}
	}

	_validateCredentials(credentials: TToolCredentials): Promise<void> {
		throw new Error('Method not implemented.')
	}
}
