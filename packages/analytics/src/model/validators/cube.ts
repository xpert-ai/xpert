import { ChecklistItem, RuleValidator } from '@metad/contracts'
import { Cube, Schema } from '@metad/ocap-core'
import { CalculatedMeasureValidator } from './calculated-member'
import { DimensionValidator } from './dimension'
import { MeasureValidator } from './measure'

export class CubeValidator implements RuleValidator {
    async validate(cube: Cube, params: { schema: Schema }): Promise<ChecklistItem[]> {
        const issues: ChecklistItem[] = []
        if (!cube) return issues

        const dimensionValidator = new DimensionValidator()
        for await (const dimension of cube.dimensions ?? []) {
			const res = await dimensionValidator.validate(dimension, { schema: params.schema })
			issues.push(...res)
		}

        const measureValidator = new MeasureValidator()
        for await (const measure of cube.measures ?? []) {
            const res = await measureValidator.validate(measure, { schema: params.schema, cubeName: cube.name })
            issues.push(...res)
        }

        const memberValidator = new CalculatedMeasureValidator()
        for await (const member of cube.calculatedMembers ?? []) {
            const res = await memberValidator.validate(member, { schema: params.schema, cubeName: cube.name })
            issues.push(...res)
        }

        return issues
    }
}
