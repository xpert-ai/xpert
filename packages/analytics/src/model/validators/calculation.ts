import { ChecklistItem, RuleValidator } from '@metad/contracts'
import { CalculationProperty, Schema } from '@metad/ocap-core'

export class CubeCalculationValidator implements RuleValidator {
	async validate(calculation: CalculationProperty, params: { schema: Schema }): Promise<ChecklistItem[]> {
		const issues: ChecklistItem[] = []

		if (!calculation.name) {
			issues.push({
				ruleCode: 'CUBE_CALCULATION_NAME_REQUIRED',
				field: 'calculation',
				value: calculation.name,
				message: {
					en_US: `Cube calculation must have a name`,
					zh_Hans: `立方体计算必须有一个名称`
				},
				level: 'error'
			})
		}
		

		return issues
	}
}
