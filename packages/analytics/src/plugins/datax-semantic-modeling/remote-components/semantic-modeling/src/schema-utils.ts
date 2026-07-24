import {
	isJsonObject,
	JsonObject,
	JsonValue,
	readArray,
	readObject,
	readString
} from '../../../../remote-components/shared/runtime'

export type StudioIssue = {
	level: 'error' | 'warning' | 'success'
	location: string
	message: string
}

export function objectCollection(input: JsonObject, key: string) {
	return readArray(input, key).filter(isJsonObject)
}

export function replaceCollection(input: JsonObject, key: string, items: JsonObject[]): JsonObject {
	return {
		...input,
		[key]: items
	}
}

export function replaceAt(items: JsonObject[], index: number, next: JsonObject) {
	return items.map((item, itemIndex) => (itemIndex === index ? next : item))
}

export function removeAt(items: JsonObject[], index: number) {
	return items.filter((_, itemIndex) => itemIndex !== index)
}

export function appendItem(items: JsonObject[], item: JsonObject) {
	return [...items, item]
}

export function setObjectValue(input: JsonObject, key: string, value: JsonValue | undefined): JsonObject {
	if (value === undefined || value === '') {
		const output = { ...input }
		delete output[key]
		return output
	}
	return {
		...input,
		[key]: value
	}
}

export function readFirstTableName(input: JsonObject) {
	const tables = readArray(input, 'tables').filter(isJsonObject)
	return readString(tables[0], 'name') ?? ''
}

export function readFactTableName(cube: JsonObject) {
	const fact = readObject(cube, 'fact')
	const table = readObject(fact, 'table')
	return readString(table, 'name') ?? readFirstTableName(cube)
}

export function setFactTableName(cube: JsonObject, tableName: string): JsonObject {
	return setObjectValue(
		cube,
		'fact',
		tableName
			? {
					type: 'table',
					table: {
						name: tableName
					}
				}
			: undefined
	)
}

export function setFirstTableName(input: JsonObject, tableName: string): JsonObject {
	return setObjectValue(input, 'tables', tableName ? [{ name: tableName }] : undefined)
}

export function localized(locale: string | undefined, en: string, zh: string) {
	return locale?.toLowerCase().startsWith('zh') ? zh : en
}

export function validateStudioSchema(schema: JsonObject, locale?: string): StudioIssue[] {
	const issues: StudioIssue[] = []
	const dimensions = objectCollection(schema, 'dimensions')
	const cubes = objectCollection(schema, 'cubes')
	const virtualCubes = objectCollection(schema, 'virtualCubes')

	if (!readString(schema, 'name')?.trim()) {
		issues.push({
			level: 'warning',
			location: 'schema.name',
			message: localized(locale, 'Give the schema a stable name.', '请为 Schema 设置稳定名称。')
		})
	}

	validateUniqueNames(dimensions, 'dimensions', issues, locale)
	validateUniqueNames(cubes, 'cubes', issues, locale)
	validateUniqueNames(virtualCubes, 'virtualCubes', issues, locale)

	for (const [dimensionIndex, dimension] of dimensions.entries()) {
		const name = readString(dimension, 'name') ?? `#${dimensionIndex + 1}`
		const hierarchies = objectCollection(dimension, 'hierarchies')
		if (!hierarchies.length) {
			issues.push({
				level: 'warning',
				location: `dimensions.${name}`,
				message: localized(locale, 'Add at least one hierarchy.', '请至少添加一个层级结构。')
			})
		}
		for (const [hierarchyIndex, hierarchy] of hierarchies.entries()) {
			const hierarchyName = readString(hierarchy, 'name') ?? `#${hierarchyIndex + 1}`
			if (!readString(hierarchy, 'primaryKey')) {
				issues.push({
					level: 'warning',
					location: `dimensions.${name}.${hierarchyName}`,
					message: localized(locale, 'Choose a hierarchy primary key.', '请选择层级结构主键。')
				})
			}
			const levels = objectCollection(hierarchy, 'levels')
			if (!levels.length) {
				issues.push({
					level: 'error',
					location: `dimensions.${name}.${hierarchyName}`,
					message: localized(locale, 'Hierarchy requires at least one level.', '层级结构至少需要一个 Level。')
				})
			}
			for (const level of levels) {
				if (!readString(level, 'name') || !readString(level, 'column')) {
					issues.push({
						level: 'error',
						location: `dimensions.${name}.${hierarchyName}.levels`,
						message: localized(
							locale,
							'Every level needs a name and column.',
							'每个 Level 都必须设置名称和字段。'
						)
					})
				}
			}
		}
	}

	for (const [cubeIndex, cube] of cubes.entries()) {
		const name = readString(cube, 'name') ?? `#${cubeIndex + 1}`
		if (!readFactTableName(cube)) {
			issues.push({
				level: 'error',
				location: `cubes.${name}.fact`,
				message: localized(locale, 'Choose a fact table.', '请选择事实表。')
			})
		}
		for (const measure of objectCollection(cube, 'measures')) {
			if (!readString(measure, 'name') || !readString(measure, 'column')) {
				issues.push({
					level: 'error',
					location: `cubes.${name}.measures`,
					message: localized(
						locale,
						'Every physical measure needs a name and column.',
						'每个物理度量都必须设置名称和字段。'
					)
				})
			}
		}
	}

	for (const virtualCube of virtualCubes) {
		const name = readString(virtualCube, 'name') ?? 'virtualCube'
		if (!objectCollection(virtualCube, 'cubeUsages').length) {
			issues.push({
				level: 'error',
				location: `virtualCubes.${name}`,
				message: localized(
					locale,
					'Virtual cube requires at least one cube usage.',
					'虚拟 Cube 至少需要引用一个 Cube。'
				)
			})
		}
	}

	if (!issues.length) {
		issues.push({
			level: 'success',
			location: 'schema',
			message: localized(locale, 'Studio validation passed.', 'Studio 校验已通过。')
		})
	}
	return issues
}

function validateUniqueNames(items: JsonObject[], collectionName: string, issues: StudioIssue[], locale?: string) {
	const names = new Set<string>()
	for (const item of items) {
		const name = readString(item, 'name')?.trim()
		if (!name) {
			issues.push({
				level: 'error',
				location: collectionName,
				message: localized(locale, 'Every artifact needs a name.', '每个对象都必须设置名称。')
			})
			continue
		}
		if (names.has(name)) {
			issues.push({
				level: 'error',
				location: `${collectionName}.${name}`,
				message: localized(locale, `Duplicate name '${name}'.`, `名称“${name}”重复。`)
			})
		}
		names.add(name)
	}
}
