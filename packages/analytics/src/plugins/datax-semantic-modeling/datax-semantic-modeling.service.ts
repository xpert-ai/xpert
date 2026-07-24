import {
	extractSemanticModelDraft,
	IDataSource,
	ISemanticModel,
	ModelTypeEnum,
	TSemanticModelDraft
} from '@xpert-ai/contracts'
import { Schema } from '@xpert-ai/ocap-core'
import { getErrorMessage } from '@xpert-ai/server-common'
import { Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ILike } from 'typeorm'
import { DataSourceQuery, DataSourceService } from '../../data-source'
import { SemanticModelCreateCommand, SemanticModelPublishCommand, SemanticModelService } from '../../model'
import {
	DataXQueryAnalysisService,
	DataXQueryExecutionContext
} from '../datax-query-analysis/datax-query-analysis.service'
import {
	SemanticModelSaveDraftInput,
	SemanticModelSchemaSchema,
	SemanticModelSchemaInput,
	SemanticModelWorkspaceCreateInput
} from './schemas'

export type SemanticModelWorkspaceRow = {
	id: string
	key?: string
	name?: string
	description?: string
	type?: string
	status?: string
	catalog?: string
	dataSourceId?: string
	dataSourceName?: string
	businessAreaId?: string
	businessAreaName?: string
	draftVersion?: number
	cubeCount: number
	dimensionCount: number
	publishAt?: Date
	updatedAt?: Date
}

export type SemanticModelWorkspaceDetail = {
	model: SemanticModelWorkspaceRow
	draft: TSemanticModelDraft<Schema>
	cubes: Array<{ name: string; caption?: string; description?: string; kind: 'cube' | 'virtualCube' }>
	dimensions: Array<{ name: string; caption?: string; description?: string }>
	checklist: TSemanticModelDraft<Schema>['checklist']
}

export type SemanticModelDataSourceOption = {
	id: string
	name: string
	type?: string
	protocol?: string
}

@Injectable()
export class DataXSemanticModelingService {
	constructor(
		private readonly semanticModelService: SemanticModelService,
		private readonly dataSourceService: DataSourceService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly queryAnalysisService: DataXQueryAnalysisService
	) {}

	async listWorkspaces(search?: string, limit = 30): Promise<SemanticModelWorkspaceRow[]> {
		const normalizedSearch = search?.trim()
		const result = await this.semanticModelService.findMy({
			where: normalizedSearch
				? [{ name: ILike(`%${normalizedSearch}%`) }, { description: ILike(`%${normalizedSearch}%`) }]
				: undefined,
			relations: ['dataSource', 'dataSource.type', 'businessArea'],
			order: {
				updatedAt: 'DESC'
			},
			take: Math.min(Math.max(limit, 1), 100)
		})
		return result.items.map(toWorkspaceRow)
	}

	async listDataSources(search?: string): Promise<SemanticModelDataSourceOption[]> {
		const result = await this.dataSourceService.findAll({
			where: search?.trim() ? { name: ILike(`%${search.trim()}%`) } : undefined,
			relations: ['type'],
			order: {
				updatedAt: 'DESC'
			},
			take: 100
		})
		return result.items.map(toDataSourceOption)
	}

	async getWorkspace(modelId: string): Promise<SemanticModelWorkspaceDetail> {
		const model = await this.semanticModelService.findOne(modelId, {
			relations: ['dataSource', 'dataSource.type', 'businessArea', 'roles']
		})
		const draft = model.draft ?? extractSemanticModelDraft<Schema>(model)
		const schema = draft.schema ?? {}
		return {
			model: toWorkspaceRow(model),
			draft: {
				...draft,
				schema
			},
			cubes: [
				...(schema.cubes ?? []).map((cube) => ({
					name: cube.name,
					caption: cube.caption,
					description: cube.description,
					kind: 'cube' as const
				})),
				...(schema.virtualCubes ?? []).map((cube) => ({
					name: cube.name,
					caption: cube.caption,
					description: cube.description,
					kind: 'virtualCube' as const
				}))
			],
			dimensions: (schema.dimensions ?? []).map((dimension) => ({
				name: dimension.name,
				caption: dimension.caption,
				description: dimension.description
			})),
			checklist: draft.checklist ?? []
		}
	}

	async listTables(modelId: string) {
		const model = await this.semanticModelService.findOne(modelId)
		return this.queryBus.execute(
			new DataSourceQuery(model.dataSourceId, {
				command: 'ListTables',
				schema: model.catalog
			})
		)
	}

	async getTableSchema(modelId: string, tableName: string) {
		const model = await this.semanticModelService.findOne(modelId)
		return this.queryBus.execute(
			new DataSourceQuery(model.dataSourceId, {
				command: 'TableSchema',
				schema: model.catalog,
				table: tableName
			})
		)
	}

	async createWorkspace(input: SemanticModelWorkspaceCreateInput, userId: string) {
		const created = await this.commandBus.execute<SemanticModelCreateCommand, ISemanticModel>(
			new SemanticModelCreateCommand({
				key: input.key,
				name: input.name,
				description: input.description,
				type: input.type ?? ModelTypeEnum.SQL,
				dataSourceId: input.dataSourceId,
				catalog: input.catalog,
				businessAreaId: input.businessAreaId,
				ownerId: userId,
				options: {
					schema: {}
				},
				draft: {
					key: input.key,
					name: input.name,
					description: input.description,
					type: input.type ?? ModelTypeEnum.SQL,
					dataSourceId: input.dataSourceId,
					businessAreaId: input.businessAreaId,
					catalog: input.catalog,
					schema: {}
				}
			})
		)
		return toWorkspaceRow(created)
	}

	async saveDraft(input: SemanticModelSaveDraftInput) {
		const workspace = await this.getWorkspace(input.modelId)
		if (
			typeof input.baseVersion === 'number' &&
			typeof workspace.draft.version === 'number' &&
			input.baseVersion !== workspace.draft.version
		) {
			throw new Error(
				`Semantic model draft changed from version ${input.baseVersion} to ${workspace.draft.version}; reload before saving.`
			)
		}
		const model = await this.semanticModelService.saveDraft(input.modelId, {
			...workspace.draft,
			schema: parseSchema(input.schema)
		})
		return {
			modelId: model.id,
			version: model.draft?.version,
			checklist: model.draft?.checklist ?? []
		}
	}

	async saveDraftJson(modelId: string, schemaJson: string, baseVersion?: number) {
		const parsed: unknown = JSON.parse(schemaJson)
		if (!isObject(parsed)) {
			throw new Error('Semantic model schema must be a JSON object.')
		}
		const schema = SemanticModelSchemaSchema.parse(parsed)
		return this.saveDraft({
			modelId,
			schema,
			baseVersion,
			changeSummary: 'Save semantic model draft'
		})
	}

	async publishWorkspace(modelId: string, releaseNotes = '') {
		const model = await this.commandBus.execute<SemanticModelPublishCommand, ISemanticModel>(
			new SemanticModelPublishCommand(modelId, releaseNotes)
		)
		return {
			modelId: model.id,
			publishAt: model.publishAt,
			releaseNotes: model.releaseNotes
		}
	}

	async executeQuery(
		modelId: string,
		cubeName: string,
		statement: string,
		limit: number,
		context: DataXQueryExecutionContext
	) {
		return this.queryAnalysisService.execute(
			{
				modelId,
				cubeName,
				statement,
				limit,
				openWorkbench: false
			},
			context
		)
	}

	async safeListTables(modelId: string) {
		try {
			return {
				items: await this.listTables(modelId),
				error: null
			}
		} catch (error) {
			return {
				items: [],
				error: getErrorMessage(error)
			}
		}
	}

	async safeGetTableSchema(modelId: string, tableName: string) {
		try {
			return {
				item: await this.getTableSchema(modelId, tableName),
				error: null
			}
		} catch (error) {
			return {
				item: null,
				error: getErrorMessage(error)
			}
		}
	}
}

function toWorkspaceRow(model: ISemanticModel): SemanticModelWorkspaceRow {
	const draft = model.draft ?? extractSemanticModelDraft<Schema>(model)
	const schema = draft.schema ?? model.options?.schema
	return {
		id: String(model.id),
		key: model.key,
		name: model.name,
		description: model.description,
		type: model.type,
		status: model.status,
		catalog: model.catalog,
		dataSourceId: model.dataSourceId,
		dataSourceName: model.dataSource?.name,
		businessAreaId: model.businessAreaId,
		businessAreaName: model.businessArea?.name,
		draftVersion: draft.version,
		cubeCount: (schema?.cubes?.length ?? 0) + (schema?.virtualCubes?.length ?? 0),
		dimensionCount: schema?.dimensions?.length ?? 0,
		publishAt: model.publishAt,
		updatedAt: model.updatedAt
	}
}

function toDataSourceOption(dataSource: IDataSource): SemanticModelDataSourceOption {
	return {
		id: String(dataSource.id),
		name: dataSource.name ?? String(dataSource.id),
		type: dataSource.type?.type,
		protocol: dataSource.type?.protocol
	}
}

function parseSchema(input: SemanticModelSchemaInput): Schema {
	const schema = SemanticModelSchemaSchema.parse(input)
	return {
		...schema,
		name: typeof input.name === 'string' ? input.name : ''
	}
}

function isObject(value: unknown): value is { [key: string]: unknown } {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
