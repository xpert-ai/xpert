import { JsonObject, readString } from '../../../../remote-components/shared/runtime'
import { objectCollection, readFactTableName, readFirstTableName, replaceAt, replaceCollection } from './schema-utils'

export type StudioNodeKind = 'cube' | 'dimension'
export type StudioFieldKind = 'measure' | 'level'

export type StudioNodeSelection =
	| {
			kind: 'cube'
			index: number
	  }
	| {
			kind: 'dimension'
			index: number
	  }

export type StudioFieldSelection = {
	kind: 'field'
	nodeKind: StudioNodeKind
	nodeIndex: number
	fieldKind: StudioFieldKind
	fieldIndex: number
	hierarchyIndex?: number
}

export type StudioSelection = StudioNodeSelection | StudioFieldSelection

export type StudioField = {
	id: string
	kind: StudioFieldKind
	name: string
	column: string
	dataType: string
	selection: StudioFieldSelection
}

export type StudioNode = {
	id: string
	kind: StudioNodeKind
	index: number
	name: string
	subtitle: string
	fields: StudioField[]
}

export type StudioEdge = {
	id: string
	source: string
	target: string
	label: string
}

export function buildGraph(schema: JsonObject): { nodes: StudioNode[]; edges: StudioEdge[] } {
	const dimensions = objectCollection(schema, 'dimensions')
	const cubes = objectCollection(schema, 'cubes')
	const nodes: StudioNode[] = [
		...dimensions.map((dimension, dimensionIndex) => {
			const fields = objectCollection(dimension, 'hierarchies').flatMap((hierarchy, hierarchyIndex) =>
				objectCollection(hierarchy, 'levels').map((level, fieldIndex) => {
					const selection: StudioFieldSelection = {
						kind: 'field',
						nodeKind: 'dimension',
						nodeIndex: dimensionIndex,
						fieldKind: 'level',
						hierarchyIndex,
						fieldIndex
					}
					return {
						id: fieldSelectionId(selection),
						kind: 'level' as const,
						name:
							readString(level, 'caption') ??
							readString(level, 'name') ??
							readString(level, 'column') ??
							`Level ${fieldIndex + 1}`,
						column: readString(level, 'column') ?? '',
						dataType: readString(level, 'type') ?? '',
						selection
					}
				})
			)
			const hierarchy = objectCollection(dimension, 'hierarchies')[0]
			return {
				id: `dimension:${dimensionIndex}`,
				kind: 'dimension' as const,
				index: dimensionIndex,
				name:
					readString(dimension, 'caption') ??
					readString(dimension, 'name') ??
					`Dimension ${dimensionIndex + 1}`,
				subtitle: readFirstTableName(hierarchy ?? {}) || 'Shared dimension',
				fields
			}
		}),
		...cubes.map((cube, cubeIndex) => ({
			id: `cube:${cubeIndex}`,
			kind: 'cube' as const,
			index: cubeIndex,
			name: readString(cube, 'caption') ?? readString(cube, 'name') ?? `Cube ${cubeIndex + 1}`,
			subtitle: readFactTableName(cube) || 'Fact table',
			fields: objectCollection(cube, 'measures').map((measure, fieldIndex) => {
				const selection: StudioFieldSelection = {
					kind: 'field',
					nodeKind: 'cube',
					nodeIndex: cubeIndex,
					fieldKind: 'measure',
					fieldIndex
				}
				return {
					id: fieldSelectionId(selection),
					kind: 'measure' as const,
					name:
						readString(measure, 'caption') ??
						readString(measure, 'name') ??
						readString(measure, 'column') ??
						`Measure ${fieldIndex + 1}`,
					column: readString(measure, 'column') ?? '',
					dataType: readString(measure, 'datatype') ?? readString(measure, 'aggregator') ?? '',
					selection
				}
			})
		}))
	]
	const edges: StudioEdge[] = []
	for (const [cubeIndex, cube] of cubes.entries()) {
		for (const [usageIndex, usage] of objectCollection(cube, 'dimensionUsages').entries()) {
			const dimensionName =
				readString(usage, 'source') ?? readString(usage, 'sharedDimension') ?? readString(usage, 'name') ?? ''
			const dimensionIndex = dimensions.findIndex(
				(dimension) =>
					readString(dimension, 'name') === dimensionName ||
					readString(dimension, 'caption') === dimensionName
			)
			if (dimensionIndex < 0) {
				continue
			}
			edges.push({
				id: `usage:${cubeIndex}:${usageIndex}`,
				source: `cube:${cubeIndex}`,
				target: `dimension:${dimensionIndex}`,
				label: readString(usage, 'foreignKey') ?? dimensionName
			})
		}
	}
	return { nodes, edges }
}

export function selectionNodeId(selection: StudioSelection | null) {
	if (!selection) {
		return null
	}
	return selection.kind === 'field'
		? `${selection.nodeKind}:${selection.nodeIndex}`
		: `${selection.kind}:${selection.index}`
}

export function selectionNode(selection: StudioSelection | null): StudioNodeSelection | null {
	if (!selection) {
		return null
	}
	return selection.kind === 'field' ? { kind: selection.nodeKind, index: selection.nodeIndex } : selection
}

export function selectionValue(schema: JsonObject, selection: StudioSelection | null): JsonObject | undefined {
	if (!selection) {
		return undefined
	}
	const dimensions = objectCollection(schema, 'dimensions')
	const cubes = objectCollection(schema, 'cubes')
	if (selection.kind === 'cube') {
		return cubes[selection.index]
	}
	if (selection.kind === 'dimension') {
		return dimensions[selection.index]
	}
	if (selection.fieldKind === 'measure') {
		return objectCollection(cubes[selection.nodeIndex] ?? {}, 'measures')[selection.fieldIndex]
	}
	const dimension = dimensions[selection.nodeIndex]
	const hierarchy = objectCollection(dimension ?? {}, 'hierarchies')[selection.hierarchyIndex ?? 0]
	return objectCollection(hierarchy ?? {}, 'levels')[selection.fieldIndex]
}

export function replaceSelectionValue(schema: JsonObject, selection: StudioSelection, value: JsonObject): JsonObject {
	const dimensions = objectCollection(schema, 'dimensions')
	const cubes = objectCollection(schema, 'cubes')
	if (selection.kind === 'cube') {
		return replaceCollection(schema, 'cubes', replaceAt(cubes, selection.index, value))
	}
	if (selection.kind === 'dimension') {
		return replaceCollection(schema, 'dimensions', replaceAt(dimensions, selection.index, value))
	}
	if (selection.fieldKind === 'measure') {
		const cube = cubes[selection.nodeIndex]
		if (!cube) {
			return schema
		}
		const measures = objectCollection(cube, 'measures')
		const nextCube = replaceCollection(cube, 'measures', replaceAt(measures, selection.fieldIndex, value))
		return replaceCollection(schema, 'cubes', replaceAt(cubes, selection.nodeIndex, nextCube))
	}
	const dimension = dimensions[selection.nodeIndex]
	if (!dimension) {
		return schema
	}
	const hierarchyIndex = selection.hierarchyIndex ?? 0
	const hierarchies = objectCollection(dimension, 'hierarchies')
	const hierarchy = hierarchies[hierarchyIndex]
	if (!hierarchy) {
		return schema
	}
	const levels = objectCollection(hierarchy, 'levels')
	const nextHierarchy = replaceCollection(hierarchy, 'levels', replaceAt(levels, selection.fieldIndex, value))
	const nextDimension = replaceCollection(
		dimension,
		'hierarchies',
		replaceAt(hierarchies, hierarchyIndex, nextHierarchy)
	)
	return replaceCollection(schema, 'dimensions', replaceAt(dimensions, selection.nodeIndex, nextDimension))
}

export function fieldSelectionId(selection: StudioFieldSelection) {
	const hierarchy = selection.hierarchyIndex === undefined ? '' : `:${selection.hierarchyIndex}`
	return `${selection.nodeKind}:${selection.nodeIndex}:${selection.fieldKind}${hierarchy}:${selection.fieldIndex}`
}
