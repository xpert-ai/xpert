import { ChecklistItem, RuleValidator } from '@metad/contracts'
import { Cube, Schema } from '@metad/ocap-core'

export class CubeValidator implements RuleValidator {
    async validate(cube: Cube, params: { schema: Schema }): Promise<ChecklistItem[]> {
        const issues: ChecklistItem[] = []

        

        return issues
    }
}
