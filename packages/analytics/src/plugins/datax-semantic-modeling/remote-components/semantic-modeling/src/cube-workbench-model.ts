import { JsonObject, readString } from '../../../../remote-components/shared/runtime'
import { CubeWorkbenchI18n } from './cube-workbench-i18n'
import { objectCollection, readFactTableName } from './schema-utils'

export type MeasureRow = {
	id: string
	kind: 'physical' | 'calculated'
	index: number
	value: JsonObject
	name: string
	column: string
	aggregator: string
	valid: boolean
}

export function measureRows(cube: JsonObject): MeasureRow[] {
	const physical = objectCollection(cube, 'measures').map((measure, index) => ({
		id: `physical:${index}`,
		kind: 'physical' as const,
		index,
		value: measure,
		name: readString(measure, 'name') ?? `Measure ${index + 1}`,
		column: readString(measure, 'column') ?? '',
		aggregator: (readString(measure, 'aggregator') ?? '').toUpperCase(),
		valid: Boolean(readString(measure, 'name')?.trim() && readString(measure, 'column')?.trim())
	}))
	const calculated = objectCollection(cube, 'calculatedMembers').map((measure, index) => ({
		id: `calculated:${index}`,
		kind: 'calculated' as const,
		index,
		value: measure,
		name: readString(measure, 'name') ?? `Calculated Measure ${index + 1}`,
		column: '',
		aggregator: '',
		valid: Boolean(readString(measure, 'name')?.trim() && readString(measure, 'formula')?.trim())
	}))
	return [...physical, ...calculated]
}

export function cubeReadiness(cube: JsonObject, rows: MeasureRow[]) {
	const checks = [
		Boolean(readString(cube, 'name')?.trim()),
		Boolean(readFactTableName(cube)),
		rows.length > 0,
		rows.every((row) => row.valid),
		objectCollection(cube, 'dimensionUsages').length + objectCollection(cube, 'dimensions').length > 0
	]
	return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

export function rowValidationMessage(row: MeasureRow, i18n: CubeWorkbenchI18n) {
	if (!row.name.trim()) {
		return i18n.t('missingName')
	}
	if (row.kind === 'physical' && !row.column.trim()) {
		return i18n.t('missingColumn')
	}
	if (row.kind === 'calculated' && !readString(row.value, 'formula')?.trim()) {
		return i18n.t('missingFormula')
	}
	return i18n.t('validationPassed')
}
