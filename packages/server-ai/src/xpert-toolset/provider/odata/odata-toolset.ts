import { ApiAuthType, I18nObject, IXpertTool, IXpertToolset, TXpertToolEntity, XpertToolsetCategoryEnum } from '@metad/contracts'
import { Service } from '@sap_oss/odata-library'
import { uniq } from 'lodash'
import { ToolProviderCredentialValidationError } from '../../errors'
import { BaseToolset } from '../../toolset'
import { ODataTool } from './odata-tool'

export class ODataToolset extends BaseToolset<ODataTool> {
	providerName = 'odata'
	providerType = XpertToolsetCategoryEnum.API

	protected service: any = null
	constructor(protected toolset?: IXpertToolset) {
		super()

		const service = this.getODataService(this.toolset)
		this.tools = this.toolset.tools?.filter((tool) => tool.enabled)
			.map((_) => {
				// Provide specific tool name to tool class
				const DynamicODataTool = class extends ODataTool {
					static lc_name(): string {
						return _.name
					}
					constructor(tool: IXpertTool, service) {
						super(tool, service)
					}
				}

				return new DynamicODataTool(_, service)
			})
	}

	getTools() {
		return this.tools
	}

	getId() {
		return this.toolset?.id
	}

	/**
	 * @todo
	 */
	getToolTitle(name: string): string | I18nObject {
		const tool = this.toolset?.tools?.find((tool) => tool.name === name)
		const identity = tool?.schema?.entity
		if (identity) {
			return identity
		}
		return null
	}

	getODataService(toolset: IXpertToolset) {
		if (this.service) {
			return this.service
		}

		const credentials = toolset.credentials

		if (!credentials?.auth_type) {
			throw new ToolProviderCredentialValidationError('Missing auth_type')
		}

		let auth = null
		if (credentials?.auth_type === ApiAuthType.BASIC) {
			auth = {
				type: 'basic',
				username: credentials.username,
				password: credentials.password
			}
		}

		const service: any = new Service({
			url: `${toolset.options.baseUrl}`,
			auth: auth,
			strict: false
		})

		return service
	}

	async getToolsSchema(): Promise<TXpertToolEntity[]> {
		const service = this.getODataService(this.toolset)
		await service.init

		const metadata = service.metadata

		const toolsSchema = []

		Object.keys(service.entitySets).map((name) => {
			const entitySet = metadata.getEntitySet(name)
			const entityType = metadata.getEntityType(entitySet.EntityType)

			const properties = uniq([...entityType.Key.map((_) => _.Name), ...Object.keys(entityType.Properties)])

			toolsSchema.push({
				name: `Create_` + name,
				method: 'create',
				entity: name,
				path: '/' + name,
				parameters: properties.map((name) => entityType.Properties[name])
					.filter((property) => property?.Visible)
					.map((property) => {
						return {
							name: property.Name,
							type: property.Type,
							label: {
								en_US: property.Label
							},
							human_description: {
								en_US: property.Quickinfo,
							},
							llm_description: property.Quickinfo,
							description: property.Quickinfo,
							required: entityType.Key.some((_) => _.Name === name),
							isKey: entityType.Key.some((_) => _.Name === name),
							schema: {
								type: mapODataTypeToOpenAPI(property.Type)
							}
						}
					})
				})

			toolsSchema.push({
				name: `Get_` + name,
				method: 'get',
				entity: name,
				path: '/' + name,
				parameters: entityType.Key.map(({ Name }) => {
					const property = entityType.Properties[Name]
					return {
						name: property.Name,
						type: property.Type,
						label: {
							en_US: property.Label
						},
						human_description: {
							en_US: property.Quickinfo,
						},
						llm_description: property.Quickinfo,
						description: property.Quickinfo,
						required: true,
						isKey: true,
						schema: {
							type: mapODataTypeToOpenAPI(property.Type)
						}
					}
				})
			})

			toolsSchema.push({
				name: `Query_` + name,
				method: 'query',
				entity: name,
				path: '/' + name,
				parameters: properties.map((name) => entityType.Properties[name])
					.filter((property) => property?.Visible)
					.map((property) => {
						return {
							name: property.Name,
							type: property.Type,
							label: {
								en_US: property.Label
							},
							human_description: {
								en_US: property.Quickinfo,
							},
							llm_description: property.Quickinfo,
							description: property.Quickinfo,
							required: entityType.Key.some((_) => _.Name === name),
							isKey: entityType.Key.some((_) => _.Name === name),
							schema: {
								type: mapODataTypeToOpenAPI(property.Type)
							}
						}
					})
				})

			toolsSchema.push({
				name: `Delete_` + name,
				method: 'delete',
				entity: name,
				path: '/' + name,
				parameters: entityType.Key.map(({ Name }) => {
					const property = entityType.Properties[Name]
					return {
						name: property.Name,
						type: property.Type,
						label: {
							en_US: property.Label
						},
						human_description: {
							en_US: property.Quickinfo,
						},
						llm_description: property.Quickinfo,
						description: property.Quickinfo,
						required: true,
						isKey: true,
						schema: {
							type: mapODataTypeToOpenAPI(property.Type)
						}
					}
				})
			})
		})

		return toolsSchema
	}
}

function mapODataTypeToOpenAPI(type: string) {
	switch (type) {
		case 'Edm.String':
			return 'string'
		case 'Edm.Decimal':
			return 'number'
		case 'Edm.DateTime':
			return 'number'
	}
}
