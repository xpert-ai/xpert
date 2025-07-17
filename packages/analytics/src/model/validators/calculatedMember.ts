import { ChecklistItem, RuleValidator } from '@metad/contracts'
import { CalculatedMember, Schema } from '@metad/ocap-core'

export class CalculatedMeasureValidator implements RuleValidator {
    async validate(measure: CalculatedMember, params: { schema: Schema; cubeName: string }): Promise<ChecklistItem[]> {
        const issues: ChecklistItem[] = []

        return issues
    }
}
