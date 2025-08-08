import { ChecklistItem, RuleValidator } from '@metad/contracts'
import { CubeParameterEnum, ParameterProperty, Schema } from '@metad/ocap-core'

export class CubeParameterValidator implements RuleValidator {
	async validate(parameter: ParameterProperty, params: { schema: Schema }): Promise<ChecklistItem[]> {
		const issues: ChecklistItem[] = []

		if (!parameter.name) {
			issues.push({
				ruleCode: 'CUBE_PARAMETER_NAME_REQUIRED',
				field: 'parameter',
				value: parameter.name,
				message: {
					en_US: `Cube parameter must have a name`,
					zh_Hans: `立方体参数必须有一个名称`
				},
				level: 'error'
			})
		}
		if (!parameter.paramType) {
			issues.push({
				ruleCode: 'CUBE_PARAMETER_TYPE_REQUIRED',
				field: 'parameter',
				value: parameter.name,
				message: {
					en_US: `Cube parameter "${parameter.name}" must have a type defined`,
					zh_Hans: `立方体参数 "${parameter.name}" 必须定义类型`
				},
				level: 'error'
			})
		} else {
			if (![CubeParameterEnum.Input, CubeParameterEnum.Select, CubeParameterEnum.Dimension].includes(
					parameter.paramType as CubeParameterEnum
				)) {
				issues.push({
					ruleCode: 'CUBE_PARAMETER_TYPE_INVALID',
					field: 'parameter',
					value: parameter.name,
					message: {
						en_US: `Cube parameter "${parameter.name}" has an invalid type "${parameter.paramType}"`,
						zh_Hans: `立方体参数 "${parameter.name}" 的类型 "${parameter.paramType}" 无效`
					},
					level: 'error'
				})
			}
		}

		return issues
	}
}
