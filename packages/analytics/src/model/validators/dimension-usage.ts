import { IDSTable } from '@metad/adapter'
import { ChecklistItem, RuleValidator } from '@metad/contracts'
import { Cube, DimensionUsage, Schema } from '@metad/ocap-core'
import { TablesCache } from './tables'

export class DimensionUsageValidator implements RuleValidator {
	constructor(private readonly tablesCache: TablesCache) {}

	async validate(
		dimension: DimensionUsage,
		params: { schema: Schema; cube: Cube; cubeTable: IDSTable }
	): Promise<ChecklistItem[]> {
		const issues: ChecklistItem[] = []

		if (!dimension.foreignKey) {
			issues.push({
				ruleCode: 'DIMENSION_USAGE_FOREIGN_KEY_REQUIRED',
				field: 'dimension',
				value: dimension.name,
				message: {
					en_US: `Dimension usage "${dimension.name}" must have a foreign key defined`,
					zh_Hans: `使用维度 "${dimension.name}" 必须定义外键`
				},
				level: 'error'
			})
		}

		if (!dimension.source) {
			issues.push({
				ruleCode: 'DIMENSION_USAGE_SOURCE_REQUIRED',
				field: 'dimension',
				value: dimension.name,
				message: {
					en_US: `Dimension usage "${dimension.name}" must have a source defined`,
					zh_Hans: `使用维度 "${dimension.name}" 必须定义源公共维度`
				},
				level: 'error'
			})
			return issues
		} else {
			if (!params.schema.dimensions?.some((d) => d.name === dimension.source)) {
				issues.push({
					ruleCode: 'DIMENSION_USAGE_SOURCE_NOT_FOUND',
					field: 'dimension',
					value: dimension.name,
					message: {
						en_US: `Dimension usage "${dimension.name}" has source "${dimension.source}" that does not exist in the schema`,
						zh_Hans: `使用维度 "${dimension.name}" 的源公共维度 "${dimension.source}" 在模式中不存在`
					},
					level: 'error'
				})
			}
		}

		if (params.cube.dimensionUsages?.some((du) => du.name === dimension.name && du.__id__ !== dimension.__id__)) {
			issues.push({
				ruleCode: 'DIMENSION_USAGE_NAME_DUPLICATE',
				field: 'dimension-usage',
				value: dimension.name,
				message: {
					en_US: `Dimension usage "${dimension.name}" name is duplicated in the cube`,
					zh_Hans: `使用维度 "${dimension.name}" 在立方体中名称重复`
				},
				level: 'error'
			})
		}

		if (issues.length) {
			return issues
		}

		// Check whether the foreign key and dimension primary key types match
		const foreignKeyColumn = params.cubeTable?.columns?.find((column) => column.name === dimension.foreignKey)

		const sharedDimension = params.schema.dimensions?.find((d) => d.name === dimension.source)
		const dimensionPrimaryKey = sharedDimension.hierarchies?.[0]?.primaryKey
		const dimensionTableName =
			sharedDimension.hierarchies?.[0]?.primaryKeyTable || sharedDimension.hierarchies?.[0]?.tables?.[0]?.name
		const dimensionTable = await this.tablesCache.getTable(dimensionTableName)
		const dimensionPrimaryKeyColumn = dimensionTable.columns?.find((column) => column.name === dimensionPrimaryKey)

		if (foreignKeyColumn?.type !== dimensionPrimaryKeyColumn?.type) {
			issues.push({
				ruleCode: 'DIMENSION_USAGE_KEY_TYPE_MISMATCH',
				field: 'dimension',
				value: dimension.name,
				message: {
					en_US: `Dimension usage "${dimension.name}" foreign key "${dimension.foreignKey}" type "${foreignKeyColumn?.type}" does not match dimension "${dimension.source}" primary key "${dimensionPrimaryKey}" type "${dimensionPrimaryKeyColumn?.type}"`,
					zh_Hans: `使用维度 "${dimension.name}" 的外键 "${dimension.foreignKey}" 类型 "${foreignKeyColumn?.type}" 与维度 "${dimension.source}" 主键 "${dimensionPrimaryKey}" 类型 "${dimensionPrimaryKeyColumn?.type}" 不匹配`
				},
				level: 'error'
			})
		}

		return issues
	}
}
