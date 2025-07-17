import { ChecklistItem, RuleValidator } from '@metad/contracts'
import { DimensionType, PropertyDimension, Schema } from '@metad/ocap-core'

export class DimensionValidator implements RuleValidator {
	async validate(dimension: PropertyDimension, params: { schema: Schema }): Promise<ChecklistItem[]> {
		const issues: ChecklistItem[] = []

		if (dimension.hierarchies?.length) {
			if (!dimension.hierarchies.some((h) => !h.name) && !dimension.defaultHierarchy) {
				issues.push({
					ruleCode: 'DIMENSION_MISSING_DEFAULT_HIERARCHY',
					field: 'dimension',
					value: dimension.name,
					message: {
						en_US: `Dimension "${dimension.name}" must have a default hierarchy or or set a hierarchy name to empty`,
						zh_Hans: `维度 "${dimension.name}" 必须有默认层次结构否则设置一个层次结构名称为空`
					},
					level: 'error'
				})
			}
		}

		if (
			dimension.type === DimensionType.TimeDimension &&
			!dimension.hierarchies?.some((h) => h.levels?.some((l) => l.type))
		) {
			issues.push({
				ruleCode: 'DIMENSION_TIME_LEVELS_MISSING_TYPE',
				field: 'dimension',
				value: dimension.name,
				message: {
					en_US: `Time dimension "${dimension.name}" must have levels with type defined`,
					zh_Hans: `时间维度 "${dimension.name}" 的层级必须定义类型`
				},
				level: 'error'
			})
		}

		if (
			dimension.type !== DimensionType.TimeDimension &&
			dimension.hierarchies?.some((h) => h.levels?.some((l) => l.type))
		) {
			issues.push({
				ruleCode: 'DIMENSION_NON_TIME_LEVELS_WITH_TYPE',
				field: 'dimension',
				value: dimension.name,
				message: {
					en_US: `Non-time dimension "${dimension.name}" should not have levels with type defined`,
					zh_Hans: `非时间维度 "${dimension.name}" 的层级不应定义类型`
				},
				level: 'error'
			})
		}

		return issues
	}
}
