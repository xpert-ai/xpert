import { ChecklistItem, RuleValidator } from '@xpert-ai/contracts'
import { PropertyMeasure, Schema } from '@xpert-ai/ocap-core'

export class MeasureValidator implements RuleValidator {
    async validate(measure: PropertyMeasure, params: { schema: Schema; cubeName: string }): Promise<ChecklistItem[]> {
        const issues: ChecklistItem[] = []

        return issues
    }
}
