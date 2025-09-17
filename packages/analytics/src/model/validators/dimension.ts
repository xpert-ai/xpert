import { ChecklistItem, RuleValidator } from '@metad/contracts'
import { Cube, DimensionType, PropertyDimension, Schema } from '@metad/ocap-core'
import { HierarchyValidator } from './hierarchy'

export class DimensionValidator implements RuleValidator {
	async validate(dimension: PropertyDimension, params: { schema: Schema; cube?: Cube }): Promise<ChecklistItem[]> {
		const issues: ChecklistItem[] = []

		if (params.cube?.dimensionUsages?.some((du) => du.name === dimension.name && du.__id__ !== dimension.__id__)) {
			issues.push({
				ruleCode: 'DIMENSION_NAME_DUPLICATE',
				field: 'dimension',
				value: dimension.name,
				message: {
					en_US: `Dimension "${dimension.name}" name is already used by another dimension usage in the cube`,
					zh_Hans: `维度 "${dimension.name}" 名称已被立方体中的另一个维度使用`,
				},
				level: 'error'
			})
		}

		if (params.cube?.dimensions?.some((d) => d.name === dimension.name && d.__id__ !== dimension.__id__)) {
			issues.push({
				ruleCode: 'DIMENSION_NAME_DUPLICATE',
				field: 'dimension',
				value: dimension.name,
				message: {
					en_US: `Dimension "${dimension.name}" name is already used by another dimension in the schema`,
					zh_Hans: `维度 "${dimension.name}" 名称在模式中已被其他维度使用`
				},
				level: 'error'
			})
		}

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

			// Check for duplicate hierarchy names
			const hierarchyNames = new Set<string>()
			for (const hierarchy of dimension.hierarchies) {
				if (hierarchyNames.has(hierarchy.name)) {
					issues.push({
						ruleCode: 'DIMENSION_HIERARCHY_NAME_DUPLICATE',
						field: 'dimension',
						value: dimension.name,
						message: {
							en_US: `Dimension "${dimension.name}" has duplicate hierarchy name "${hierarchy.name}"`,
							zh_Hans: `维度 "${dimension.name}" 有重复的层次结构名称 "${hierarchy.name}"`
						},
						level: 'error'
					})
				} else {
					hierarchyNames.add(hierarchy.name)
				}

				const hierarchyIssues = await new HierarchyValidator().validate(hierarchy, {
					schema: params.schema,
					dimensionName: dimension.name
				})
				issues.push(...hierarchyIssues)
			}

			// Must specify a foreign key, because the hierarchy table is different from the fact table.
			if (params.cube && !dimension.foreignKey) {
				dimension.hierarchies.some((h) => {
					if (h.tables?.[0] && h.tables[0].name !== params.cube?.fact?.table?.name) {
						issues.push({
							ruleCode: 'DIMENSION_MISSING_FOREIGN_KEY',
							field: 'dimension',
							value: dimension.name,
							message: {
								en_US: `Dimension "${dimension.name}" must specify a foreign key because the hierarchy table is different from the fact table`,
								zh_Hans: `维度 "${dimension.name}" 必须指定一个外键，因为层次结构表与事实表不同`
							},
							level: 'error'
						})
					}
				})
			}
		}

		if (
			dimension.type === DimensionType.TimeDimension &&
				dimension.hierarchies?.some((h) => h.levels?.some((l) => !l.levelType))
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
			dimension.hierarchies?.some((h) => h.levels?.some((l) => l.levelType))
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
