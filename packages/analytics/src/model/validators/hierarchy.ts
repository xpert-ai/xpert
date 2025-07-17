import { ChecklistItem, RuleValidator } from '@metad/contracts'
import { PropertyHierarchy, Schema } from '@metad/ocap-core'

export class HierarchyValidator implements RuleValidator {
    async validate(hierarchy: PropertyHierarchy, params: { schema: Schema; dimensionName: string }): Promise<ChecklistItem[]> {
        const issues: ChecklistItem[] = []

        

        return issues
    }
}
