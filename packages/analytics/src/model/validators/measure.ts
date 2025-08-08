import { ChecklistItem, RuleValidator } from '@metad/contracts'
import { PropertyMeasure, Schema } from '@metad/ocap-core'

export class MeasureValidator implements RuleValidator {
    async validate(measure: PropertyMeasure, params: { schema: Schema; cubeName: string }): Promise<ChecklistItem[]> {
        const issues: ChecklistItem[] = []

        return issues
    }
}
