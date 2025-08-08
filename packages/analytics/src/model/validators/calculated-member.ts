import { ChecklistItem, RuleValidator } from '@metad/contracts'
import { CalculatedMember, Schema } from '@metad/ocap-core'

export class CalculatedMeasureValidator implements RuleValidator {
    async validate(measure: CalculatedMember, params: { schema: Schema; cubeName: string }): Promise<ChecklistItem[]> {
        const issues: ChecklistItem[] = []

        if (!measure.name) {
            issues.push({
                message: { en_US: 'Calculated member name is required', zh_Hans: '计算成员名称是必需的' },
                level: 'error',
                field: 'name',
                ruleCode: 'CALCULATED_MEMBER_NAME_REQUIRED'
            })
        }

        if (!measure.formula) {
            issues.push({
                message: { en_US: 'Calculated member formula is required', zh_Hans: '计算成员公式是必需的' },
                level: 'error',
                field: 'formula',
                ruleCode: 'CALCULATED_MEMBER_FORMULA_REQUIRED'
            })
        }
        
        return issues
    }
}
