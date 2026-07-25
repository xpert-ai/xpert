import {
	Cube,
	DimensionUsage,
	PropertyDimension,
	PropertyHierarchy,
	PropertyLevel,
	PropertyMeasure,
	Schema,
	Table
} from '@xpert-ai/ocap-core'
import { SemanticModelSchemaInput } from './schemas'

type LegacyForeignKey = {
	column?: string
	referencedDimension?: string
	referencedColumn?: string
}

type LegacyCubeDimension = PropertyDimension & {
	label?: string
	foreignKeys?: LegacyForeignKey[]
}

type LegacyCube = Omit<Cube, 'dimensions'> & {
	label?: string
	table?: string | Table
	dimensions?: LegacyCubeDimension[]
}

type LegacySharedDimension = PropertyDimension & {
	label?: string
	table?: string | Table
	primaryKey?: string
}

type LegacyHierarchy = PropertyHierarchy & {
	label?: string
}

type LegacyLevel = PropertyLevel & {
	label?: string
}

type LegacyMeasure = PropertyMeasure & {
	label?: string
}

/**
 * Converts the concise schema shape commonly authored by an Agent into the
 * canonical OCAP schema consumed by the MDX runtime. Canonical input is kept
 * intact, so the same function is safe at save, query, and publish boundaries.
 */
export function normalizeConversationalSemanticSchema(input: SemanticModelSchemaInput): Schema {
	return {
		...input,
		name: input.name ?? '',
		cubes: (input.cubes ?? []).map((cube) => normalizeCube(cube as unknown as LegacyCube)),
		dimensions: (input.dimensions ?? []).map((dimension) =>
			normalizeSharedDimension(dimension as unknown as LegacySharedDimension)
		),
		virtualCubes: input.virtualCubes ?? []
	}
}

function normalizeCube(source: LegacyCube): Cube {
	const { label, table, dimensions: sourceDimensions, ...cube } = source
	const tableName = normalizeTableName(table)
	const legacyUsages = (sourceDimensions ?? [])
		.map(toDimensionUsage)
		.filter((usage): usage is DimensionUsage => Boolean(usage))
	const dimensionUsages = (source.dimensionUsages?.length ?? 0) > 0 ? source.dimensionUsages : legacyUsages
	const localDimensions =
		legacyUsages.length > 0
			? (sourceDimensions ?? []).filter((dimension) => !(dimension.foreignKeys?.length ?? 0))
			: sourceDimensions

	return {
		...cube,
		caption: source.caption ?? label,
		...(source.fact
			? { fact: source.fact }
			: tableName
				? {
						fact: {
							type: 'table',
							table: {
								name: tableName
							}
						}
					}
				: {}),
		...(dimensionUsages?.length ? { dimensionUsages } : {}),
		...(localDimensions?.length
			? {
					dimensions: localDimensions.map((dimension) =>
						normalizeSharedDimension(dimension as unknown as LegacySharedDimension)
					)
				}
			: {}),
		...(source.measures
			? {
					measures: source.measures.map((measure) => normalizeMeasure(measure as LegacyMeasure))
				}
			: {})
	}
}

function toDimensionUsage(dimension: LegacyCubeDimension): DimensionUsage | null {
	const foreignKey = dimension.foreignKeys?.[0]
	const name = dimension.name?.trim()
	const source = foreignKey?.referencedDimension?.trim() || name
	const foreignKeyColumn = foreignKey?.column?.trim()
	if (!name || !source || !foreignKeyColumn) {
		return null
	}
	return {
		name,
		source,
		foreignKey: foreignKeyColumn,
		caption: dimension.caption ?? dimension.label,
		description: dimension.description
	}
}

function normalizeSharedDimension(source: LegacySharedDimension): PropertyDimension {
	const { label, table, primaryKey, ...dimension } = source
	const tableName = normalizeTableName(table)
	return {
		...dimension,
		caption: source.caption ?? label,
		...(source.hierarchies
			? {
					hierarchies: source.hierarchies.map((hierarchy) =>
						normalizeHierarchy(hierarchy as LegacyHierarchy, tableName, primaryKey)
					)
				}
			: {})
	}
}

function normalizeHierarchy(source: LegacyHierarchy, tableName?: string, primaryKey?: string): PropertyHierarchy {
	const { label, ...hierarchy } = source
	const resolvedPrimaryKey = source.primaryKey ?? primaryKey
	const resolvedPrimaryKeyTable = source.primaryKeyTable ?? tableName
	return {
		...hierarchy,
		caption: source.caption ?? label,
		...(source.tables?.length
			? { tables: source.tables }
			: tableName
				? {
						tables: [
							{
								name: tableName
							}
						]
					}
				: {}),
		...(resolvedPrimaryKey ? { primaryKey: resolvedPrimaryKey } : {}),
		...(resolvedPrimaryKeyTable ? { primaryKeyTable: resolvedPrimaryKeyTable } : {}),
		...(source.levels
			? {
					levels: source.levels.map((level) => normalizeLevel(level as LegacyLevel))
				}
			: {})
	}
}

function normalizeLevel(source: LegacyLevel): PropertyLevel {
	const { label, ...level } = source
	return {
		...level,
		caption: source.caption ?? label
	}
}

function normalizeMeasure(source: LegacyMeasure): PropertyMeasure {
	const { label, ...measure } = source
	return {
		...measure,
		caption: source.caption ?? label
	}
}

function normalizeTableName(value: string | Table | undefined) {
	if (typeof value === 'string') {
		return value.trim() || undefined
	}
	return value?.name?.trim() || undefined
}
