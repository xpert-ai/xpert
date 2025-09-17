import { IDSTable } from '@metad/adapter'
import { ChecklistItem, RuleValidator } from '@metad/contracts'
import { Cube, Schema } from '@metad/ocap-core'
import { CommandBus } from '@nestjs/cqrs'
import { CalculatedMeasureValidator } from './calculated-member'
import { CubeCalculationValidator } from './calculation'
import { DimensionValidator } from './dimension'
import { DimensionUsageValidator } from './dimension-usage'
import { MeasureValidator } from './measure'
import { CubeParameterValidator } from './parameter'
import { TablesCache } from './tables'

export class CubeValidator implements RuleValidator {
    private cubeTable: IDSTable = null
    private tablesCache = new TablesCache(this.commandBus, this.dataSource, this.schema)

	constructor(
        private readonly commandBus: CommandBus,
        private readonly dataSource: string,
		private readonly schema: string
    ) {}

	async validate(
		cube: Cube,
		params: { schema: Schema }
	): Promise<ChecklistItem[]> {
		const issues: ChecklistItem[] = []
		if (!cube) return issues

		if (cube.fact?.type === 'table' && cube.fact.table?.name) {
			this.cubeTable = await this.tablesCache.getTable(cube.fact.table.name)
		}

		const dimensionUsageValidator = new DimensionUsageValidator(this.tablesCache)
		for await (const dimensionUsage of cube.dimensionUsages ?? []) {
			const res = await dimensionUsageValidator.validate(dimensionUsage, { schema: params.schema, cube, cubeTable: this.cubeTable })
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
