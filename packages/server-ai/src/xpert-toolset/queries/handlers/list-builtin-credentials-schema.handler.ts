import { CredentialsType, ToolProviderCredentials } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { ToolsetRegistry } from '@xpert-ai/plugin-sdk'
import { ToolProviderNotFoundError } from '../../errors'
import { TToolsetProviderSchema } from '../../types'
import { ListBuiltinCredentialsSchemaQuery } from '../list-builtin-credentials-schema.query'
import { ListBuiltinToolProvidersQuery } from '../list-builtin-providers.query'

@QueryHandler(ListBuiltinCredentialsSchemaQuery)
export class ListBuiltinCredentialsSchemaHandler implements IQueryHandler<ListBuiltinCredentialsSchemaQuery> {
	protected logger = new Logger(ListBuiltinCredentialsSchemaHandler.name)

	constructor(
		private readonly queryBus: QueryBus,
		private readonly toolsetRegistry: ToolsetRegistry
	) {}

	public async execute(command: ListBuiltinCredentialsSchemaQuery): Promise<ToolProviderCredentials[]> {
		const { provider } = command

		// First check if it's a plugin toolset
		try {
			const pluginStrategy = this.toolsetRegistry.get(provider)
			if (pluginStrategy) {
				// Plugin toolset: read from strategy's meta.configSchema
				const configSchema = pluginStrategy.meta.configSchema
				if (!configSchema || !configSchema.properties) {
					return []
				}
	
				// Convert JSON Schema to ToolProviderCredentials[] format
				const credentials: ToolProviderCredentials[] = []
				const required = configSchema.required || []
	
				for (const [name, property] of Object.entries(configSchema.properties)) {
					const prop = property as any
					const credential: ToolProviderCredentials = {
						name,
						required: required.includes(name),
						label: prop.title || { en_US: name, zh_Hans: name },
						placeholder: prop.description || prop.title,
						help: prop.description,
						default: prop.default,
						type: CredentialsType.TEXT_INPUT
					}
	
					// Handle x-ui extensions (e.g., secretInput)
					if (prop['x-ui']?.component === 'secretInput') {
						credential.type = CredentialsType.SECRET_INPUT
					} else if (prop.enum) {
						// Handle enum type (dropdown list)
						credential.type = CredentialsType.SELECT
						credential.options = prop.enum.map((value: string | number | boolean) => {
							const valueKey = String(value)
							const enumLabels = prop['x-ui']?.enumLabels?.[valueKey] || {}
							return {
								value: valueKey,
								label: enumLabels || { en_US: valueKey, zh_Hans: valueKey }
							}
						})
					} else if (prop.type === 'boolean') {
						credential.type = CredentialsType.BOOLEAN
					} else if (prop.type === 'number' || prop.type === 'integer') {
						credential.type = CredentialsType.NUMBER
					} else {
						credential.type = CredentialsType.TEXT_INPUT
					}
	
					credentials.push(credential)
				}
	
				return credentials
			}
		} catch {
			// Not a plugin toolset, will fallback to built-in below
		}
		// Built-in toolset: read from YAML
		const toolProviders = await this.queryBus.execute<ListBuiltinToolProvidersQuery, TToolsetProviderSchema[]>(
			new ListBuiltinToolProvidersQuery([provider])
		)

		if (!toolProviders[0]) {
			throw new ToolProviderNotFoundError(`Not found tool provider '${provider}'`)
		}

		return Object.entries(toolProviders[0].credentials_for_provider ?? {}).map(([name, value]) => ({...value, name}))
	}
}
