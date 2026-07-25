import { JsonObject, JsonValue, readString } from '../../../../remote-components/shared/runtime'
import { appendItem, objectCollection, removeAt, replaceAt, replaceCollection, setObjectValue } from './schema-utils'

export type DerivedItemKind = 'calculation' | 'calculatedMember' | 'parameter'

export type DerivedItemSelection = {
	kind: DerivedItemKind
	cubeIndex: number
	index: number
}

export type DerivedItemEntry = DerivedItemSelection & {
	id: string
	name: string
	scope: string
	value: JsonObject
}

const collectionByKind: { [K in DerivedItemKind]: string } = {
	calculation: 'calculations',
	calculatedMember: 'calculatedMembers',
	parameter: 'parameters'
}

export function listDerivedItems(schema: JsonObject): DerivedItemEntry[] {
	return objectCollection(schema, 'cubes').flatMap((cube, cubeIndex) => {
		const scope = readString(cube, 'caption') ?? readString(cube, 'name') ?? `Cube ${cubeIndex + 1}`
		return (Object.keys(collectionByKind) as DerivedItemKind[]).flatMap((kind) =>
			objectCollection(cube, collectionByKind[kind]).map((value, index) => ({
				kind,
				cubeIndex,
				index,
				id: derivedItemId({ kind, cubeIndex, index }),
				name:
					readString(value, 'caption') ??
					readString(value, 'name') ??
					`${defaultItemLabel(kind)} ${index + 1}`,
				scope,
				value
			}))
		)
	})
}

export function findDerivedItem(schema: JsonObject, selection: DerivedItemSelection | null): DerivedItemEntry | null {
	if (!selection) {
		return null
	}
	return listDerivedItems(schema).find((entry) => entry.id === derivedItemId(selection)) ?? null
}

export function appendDerivedItem(
	schema: JsonObject,
	kind: Extract<DerivedItemKind, 'calculation' | 'parameter'>,
	cubeIndex: number
): { schema: JsonObject; selection: DerivedItemSelection } | null {
	const cubes = objectCollection(schema, 'cubes')
	const cube = cubes[cubeIndex]
	if (!cube) {
		return null
	}
	const collection = collectionByKind[kind]
	const items = objectCollection(cube, collection)
	const nextValue: JsonObject =
		kind === 'calculation'
			? {
					name: `Calculation ${items.length + 1}`,
					expression: '',
					visible: true
				}
			: {
					name: `Parameter ${items.length + 1}`,
					type: 'String',
					defaultValue: ''
				}
	return {
		schema: replaceCollection(
			schema,
			'cubes',
			replaceAt(cubes, cubeIndex, replaceCollection(cube, collection, appendItem(items, nextValue)))
		),
		selection: {
			kind,
			cubeIndex,
			index: items.length
		}
	}
}

export function updateDerivedItem(
	schema: JsonObject,
	selection: DerivedItemSelection,
	key: string,
	value: JsonValue | undefined
): JsonObject {
	const cubes = objectCollection(schema, 'cubes')
	const cube = cubes[selection.cubeIndex]
	if (!cube) {
		return schema
	}
	const collection = collectionByKind[selection.kind]
	const items = objectCollection(cube, collection)
	const item = items[selection.index]
	if (!item) {
		return schema
	}
	const nextCube = replaceCollection(
		cube,
		collection,
		replaceAt(items, selection.index, setObjectValue(item, key, value))
	)
	return replaceCollection(schema, 'cubes', replaceAt(cubes, selection.cubeIndex, nextCube))
}

export function moveDerivedItem(
	schema: JsonObject,
	selection: DerivedItemSelection,
	targetCubeIndex: number
): { schema: JsonObject; selection: DerivedItemSelection } | null {
	if (selection.cubeIndex === targetCubeIndex) {
		return { schema, selection }
	}
	const cubes = objectCollection(schema, 'cubes')
	const sourceCube = cubes[selection.cubeIndex]
	const targetCube = cubes[targetCubeIndex]
	if (!sourceCube || !targetCube) {
		return null
	}
	const collection = collectionByKind[selection.kind]
	const sourceItems = objectCollection(sourceCube, collection)
	const item = sourceItems[selection.index]
	if (!item) {
		return null
	}
	const targetItems = objectCollection(targetCube, collection)
	const nextCubes = [...cubes]
	nextCubes[selection.cubeIndex] = replaceCollection(sourceCube, collection, removeAt(sourceItems, selection.index))
	nextCubes[targetCubeIndex] = replaceCollection(targetCube, collection, appendItem(targetItems, item))
	return {
		schema: replaceCollection(schema, 'cubes', nextCubes),
		selection: {
			...selection,
			cubeIndex: targetCubeIndex,
			index: targetItems.length
		}
	}
}

export function derivedItemExpression(entry: Pick<DerivedItemEntry, 'kind' | 'value'>) {
	if (entry.kind === 'parameter') {
		return readString(entry.value, 'defaultValue') ?? ''
	}
	return readString(entry.value, entry.kind === 'calculatedMember' ? 'formula' : 'expression') ?? ''
}

export function derivedItemId(selection: DerivedItemSelection) {
	return `${selection.kind}:${selection.cubeIndex}:${selection.index}`
}

function defaultItemLabel(kind: DerivedItemKind) {
	return kind === 'calculation' ? 'Calculation' : kind === 'calculatedMember' ? 'Calculated member' : 'Parameter'
}
