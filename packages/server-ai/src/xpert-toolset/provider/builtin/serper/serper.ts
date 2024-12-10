import { IXpertToolset, TToolCredentials } from '@metad/contracts'
import { ToolProviderCredentialValidationError } from '../../../errors'
import { BuiltinToolset } from '../builtin-toolset'

export class SerperToolset extends BuiltinToolset {
	static provider = 'serper'

	constructor(protected toolset?: IXpertToolset) {
		super(SerperToolset.provider, toolset)

		if (toolset) {
			const tool = toolset.tools?.[0]
			if (tool?.enabled) {
				if (!toolset.credentials?.api_key) {
					throw new ToolProviderCredentialValidationError(`Credential 'api_key' not provided`)
				}
			}
		}
	}

	async _validateCredentials(credentials: TToolCredentials) {
		throw new ToolProviderCredentialValidationError(`Method not implemented.`)
	}
}
