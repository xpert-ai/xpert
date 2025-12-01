import { ApiToolBundle, CredentialsType, ToolProviderCredentials } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ApiBasedToolSchemaParser } from '../../utils/parser'
import { ParserOpenAPISchemaCommand } from '../parser-openapi-schema.command'

@CommandHandler(ParserOpenAPISchemaCommand)
export class ParserOpenAPISchemaHandler implements ICommandHandler<ParserOpenAPISchemaCommand> {
	readonly #logger = new Logger(ParserOpenAPISchemaHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
	) {}

	public async execute(command: ParserOpenAPISchemaCommand) {
		const schema = command.schema
		try {
			const warnings: Record<string, any> = {}
			let toolBundles: ApiToolBundle[];
            let schemaType: string;

			try {
				[toolBundles, schemaType] = await ApiBasedToolSchemaParser.autoParseToToolBundle(schema, warnings)
			} catch (e) {
				throw new Error(`invalid schema: ${e.message}`)
			}

			const credentialsSchema: ToolProviderCredentials[] = [
				{
					name: 'auth_type',
					type: CredentialsType.SELECT,
					required: true,
					default: 'none',
					options: [
						{ value: 'none', label: { en_US: 'None', zh_Hans: '无' } },
						{ value: 'api_key', label: { en_US: 'Api Key', zh_Hans: 'Api Key' } }
					],
					placeholder: { en_US: 'Select auth type', zh_Hans: '选择认证方式' }
				},
				{
					name: 'api_key_header',
					type: CredentialsType.TEXT_INPUT,
					required: false,
					placeholder: { en_US: 'Enter api key header', zh_Hans: '输入 api key header，如：X-API-KEY' },
					default: 'api_key',
					help: { en_US: 'HTTP header name for api key', zh_Hans: 'HTTP 头部字段名，用于传递 api key' }
				},
				{
					name: 'api_key_value',
					type: CredentialsType.TEXT_INPUT,
					required: false,
					placeholder: { en_US: 'Enter api key', zh_Hans: '输入 api key' },
					default: ''
				}
			]

			return {
				schema_type: schemaType,
				parameters_schema: toolBundles,
				credentials_schema: credentialsSchema,
				warning: warnings
			}
		} catch (e) {
			throw new Error(`invalid schema: ${e.message}`)
		}
	}
}
