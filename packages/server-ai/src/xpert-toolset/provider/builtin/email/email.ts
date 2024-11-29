import { IXpertToolset, TToolCredentials } from '@metad/contracts'
import { BuiltinToolset } from '../builtin-toolset'

export class SmtpToolset extends BuiltinToolset {
	static provider = 'email'

	constructor(protected toolset?: IXpertToolset) {
		super(SmtpToolset.provider, toolset)
		if (toolset?.tools) {
			this.tools = []
		}
	}

	_validateCredentials(credentials: TToolCredentials): Promise<void> {
		throw new Error('Method not implemented.')
	}
}
