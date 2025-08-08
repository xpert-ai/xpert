import { ChecklistItem, RuleValidator } from '@metad/contracts'
import { Cube, Schema } from '@metad/ocap-core'
import { CalculatedMeasureValidator } from './calculated-member'
import { DimensionValidator } from './dimension'
import { MeasureValidator } from './measure'
import { DimensionUsageValidator } from './dimension-usage'
import { CubeParameterValidator } from './parameter'
import { CubeCalculationValidator } from './calculation'

export class CubeValidator implements RuleValidator {
    async validate(cube: Cube, params: { schema: Schema }): Promise<ChecklistItem[]> {
        const issues: ChecklistItem[] = []
        if (!cube) return issues

        const dimensionUsageValidator = new DimensionUsageValidator()
        for await (const dimensionUsage of cube.dimensionUsages ?? []) {
            const res = await dimensionUsageValidator.validate(dimensionUsage, { schema: params.schema, cube, })
            issues.push(...res)
        }

        const dimensionValidator = new DimensionValidator()
        for await (const dimension of cube.dimensions ?? []) {
			const res = await dimensionValidator.validate(dimension, { schema: params.schema, cube })
			issues.push(...res)
		}

        const measureValidator = new MeasureValidator()
        if (!cube.measures?.length) {
            issues.push({
                message: { en_US: 'At least one measure is required', zh_Hans: '至少需要一个度量' },
                level: 'error',
                field: 'measures',
                ruleCode: 'CUBE_MEASURES_REQUIRED',
                value: cube.name
            })
        } else {
            for await (const measure of cube.measures ?? []) {
                const res = await measureValidator.validate(measure, { schema: params.schema, cubeName: cube.name })
                issues.push(...res)
            }
        }

        const memberValidator = new CalculatedMeasureValidator()
        for await (const member of cube.calculatedMembers ?? []) {
            const res = await memberValidator.validate(member, { schema: params.schema, cubeName: cube.name })
            issues.push(...res)
        }

        const parameterValidator = new CubeParameterValidator()
        for await (const parameter of cube.parameters ?? []) {
            const res = await parameterValidator.validate(parameter, { schema: params.schema })
            issues.push(...res)
        }

        const calculationValidator = new CubeCalculationValidator()
        for await (const calculation of cube.calculations ?? []) {
            const res = await calculationValidator.validate(calculation, { schema: params.schema })
            issues.push(...res)
        }

        return issues
    }
}
