import { ChecklistItem, RuleValidator } from '@metad/contracts'
import { Cube, DimensionUsage, Schema } from '@metad/ocap-core'

export class DimensionUsageValidator implements RuleValidator {
	async validate(dimension: DimensionUsage, params: { schema: Schema; cube: Cube }): Promise<ChecklistItem[]> {
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

		if (dimension.source) {
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

		return issues
	}
}
