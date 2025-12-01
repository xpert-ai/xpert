import { ApiToolBundle, ToolProviderCredentials } from '@metad/contracts'
import { Command } from '@nestjs/cqrs'

export class ParserOpenAPISchemaCommand extends Command<{
	parameters_schema: ApiToolBundle[]
	schema_type: string
	credentials_schema: ToolProviderCredentials[]
	warning: Record<string, any>
}> {
	static readonly type = '[Xpert Toolset] Parser OpenAPI Schema'

	constructor(public readonly schema: string) {
		super()
	}
}
