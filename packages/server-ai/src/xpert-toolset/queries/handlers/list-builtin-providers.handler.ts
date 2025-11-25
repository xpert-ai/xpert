import { ToolTagEnum } from '@metad/contracts'
import { ConfigService } from '@metad/server-config'
import { loadYamlFile } from '@metad/server-core'
import { Inject, Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { ToolsetRegistry } from '@xpert-ai/plugin-sdk'
import * as path from 'path'
import { BUILTIN_TOOLSET_REPOSITORY } from '../../provider/builtin'
import { TToolsetProviderSchema } from '../../types'
import { ListBuiltinToolProvidersQuery } from '../list-builtin-providers.query'

@QueryHandler(ListBuiltinToolProvidersQuery)
export class ListBuiltinToolProvidersHandler implements IQueryHandler<ListBuiltinToolProvidersQuery> {
	protected logger = new Logger(ListBuiltinToolProvidersHandler.name)

	@Inject(ConfigService)
	protected readonly configService: ConfigService

	private readonly _builtinProviders = new Map<string, TToolsetProviderSchema>()

	constructor(private readonly toolsetRegistry: ToolsetRegistry) {}

	public async execute(command: ListBuiltinToolProvidersQuery): Promise<TToolsetProviderSchema[]> {
		const { names, tags } = command

		const items: TToolsetProviderSchema[] = []
		BUILTIN_TOOLSET_REPOSITORY.forEach((repository) => {
			items.push(
				...repository.providers
					.filter((type) => {
						if (names?.length) {
							return names.includes(type.provider)
						}
						return true
					})
					.map((type) => {
						const name = type.provider
						const schema = this.getProviderSchema(repository.baseUrl, name)

						return schema
					})
					.filter((type) => {
						if (tags?.length) {
							return tags.every((tag) => type.identity.tags?.includes(tag as ToolTagEnum))
						}
						return true
					})
			)
		})

		const pluginProviders = this.toolsetRegistry.list()
		pluginProviders.forEach((provider) => {
			if (names?.length && !names.includes(provider.meta.name)) {
				return
			}
			if (tags?.length && !tags.every((tag) => provider.meta.tags?.includes(tag as ToolTagEnum))) {
				return
			}
			items.push({
				identity: {
					author: provider.meta.author,
					tags: provider.meta.tags as ToolTagEnum[],
					name: provider.meta.name,
					label: provider.meta.label,
					description: provider.meta.description,
					icon: provider.meta.icon.svg,
				}
			})
		})

		return items
	}

	getProviderServerPath(baseUrl: string, name: string) {
		return path.join(this.configService.assetOptions.serverRoot, baseUrl, name)
	}

	getProviderSchema(baseUrl: string, name: string) {
		if (this._builtinProviders.get(name)) {
			return this._builtinProviders.get(name)
		}

		try {
			const yamlPath = path.join(this.getProviderServerPath(baseUrl, name), `${name}.yaml`)
			const yamlData = loadYamlFile(yamlPath, this.logger) as TToolsetProviderSchema
			this._builtinProviders.set(name, yamlData)
			return yamlData
		} catch (e) {
			throw new Error(`Invalid provider schema for ${name}: ${e.message}`)
		}
	}

}
