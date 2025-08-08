import { nonBlank, Property, Schema, SQLExpression } from '@metad/ocap-core'
import { IModelRole, ISemanticModel, MDX, RoleTypeEnum } from '@metad/contracts'
import { camelCase, cloneDeep, cloneDeepWith, forIn, isArray, isNil, isObject, isString, omit, pick } from 'lodash'
import { Observable } from 'rxjs'
import xml2js from 'xml2js'

export function serializeUniqueName(dimension: string, hierarchy?: string, level?: string) {
	const name = !!hierarchy && dimension !== hierarchy ? `[${dimension}.${hierarchy}]` : `[${dimension}]`
	if (level) {
		return `${name}.[${level}]`
	}
	return name
}

export function buildSchema(input: MDX.Schema): string {
	const schema = cloneDeepWith(cloneDeep(input), (value: any, key, object) => {
		if (isObject(value) && !isArray(value) && key !== '$') {
			forIn(value, (v, key) => {
				if (isNil(v)) {
					delete value[key]
				} else if (isString(key) && key !== '_') {
					if (key.startsWith('__') && key.endsWith('__')) {
						delete value[key]
					} else if (camelCase(key) === key) {
						value['$'] = value['$'] || {}
						value['$'][key] = v
						delete value[key]
					}
				}
			})
		}
	})

	const builder = new xml2js.Builder()
	return builder.buildObject({
		Schema: schema
	})
}

function parseBooleans(str) {
	if (/^(?:true|false)$/i.test(str)) {
		str = str.toLowerCase() === 'true'
	}
	return str
}

export function parseSchema(input: string) {
	// const parser = xml2js.Parser({ parseBooleans: true })
	return new Observable((observabler) => {
		xml2js.parseString(
			input,
			{ valueProcessors: [parseBooleans], attrValueProcessors: [parseBooleans] },
			(err, result) => {
				if (err) {
					return observabler.error(err)
				}

				result = cloneDeepWith(result, (value: any, key, object) => {
					// if (value === 'true') {
					//   return true
					// }
					// if (value === 'false') {
					//   return false
					// }
					if (isObject(value) && !isArray(value) && key !== '$') {
						forIn(value, (v, key) => {
							if (key === '$') {
								forIn(v, (attr, name) => {
									value[name] = attr
								})

								delete value[key]
							}
						})
					}
				})

				observabler.next(result)
				observabler.complete()
			}
		)
	})
}

/**
 * Convert the OCAP protocol schema to Mondrian format schema and then generate XMLA Schema
 */
export function convertSchemaToXmla(model: ISemanticModel, schema: Schema): MDX.Schema {
	return {
		name: model.name ?? schema.name,
		description: model.description,
		Dimension: schema.dimensions?.map(convertDimensionToXmla),
		Cube: schema.cubes?.map((cube) => {
			const fact = {} as Partial<MDX.Cube>
			if (cube.fact?.type) {
				if (cube.fact.type === 'table') {
					fact.Table = cube.fact.table
				} else if (cube.fact.type === 'view') {
					const view = convertSQLExpressionToXmla(cube.fact.view) as MDX.View
					view.alias = cube.fact.view.alias
					fact.View = view
				}
			} else {
				fact.Table = cube.tables
			}
			
			return {
				...pick(cube, ['name', 'caption', 'description', 'defaultMeasure', 'visible', 'enabled', 'cache']),
				...fact,
				DimensionUsage: cube.dimensionUsages?.map((usage) => ({
					...usage
				})),
				Dimension: cube.dimensions?.map(convertDimensionToXmla),
				Measure: cube.measures?.map(convertMeasureToXmla),
				CalculatedMember: cube.calculatedMembers?.filter((_) => _.name && _.formula).map(convertCalculatedMemberToXmla)
			} as MDX.Cube
		}),
		VirtualCube: schema.virtualCubes?.map((virtualCube) => ({
			...omit(virtualCube, ['cubeUsages', 'virtualCubeDimensions', 'virtualCubeMeasures', 'calculatedMembers']),
			name: virtualCube.name,
			CubeUsages: {
				CubeUsage: virtualCube.cubeUsages,
			},
			VirtualCubeDimension: virtualCube.virtualCubeDimensions?.map((virtualCubeDimension) => ({
				...virtualCubeDimension,
				cubeName: virtualCubeDimension.__shared__ ? null : virtualCubeDimension.cubeName
			})),
			VirtualCubeMeasure: virtualCube.virtualCubeMeasures,
			CalculatedMember: virtualCube.calculatedMembers?.filter((_) => _.name && _.formula).map((item) => ({
				...omit(item, ['formula']),
				Formula: item.formula
			}))
		} as MDX.VirtualCube))
	}
}

export function convertDimensionToXmla(dimension: Property): MDX.Dimension {
	return {
		...omit(dimension, ['hierarchies', 'semantics']),
		type: dimension.type as MDX.DimensionType,
		Hierarchy: dimension.hierarchies?.map(
			(hierarchy) =>
				({
					...omit(hierarchy, ['levels', 'tables', 'Join']) ,
					name: hierarchy.name ?? '',
					...convertTablesJoinToXmla(hierarchy.tables),
					Level: hierarchy.levels?.map((level) => ({
						...omit(level, ['keyExpression', 'nameExpression', 'captionExpression', 'ordinalExpression', 'parentExpression', 'properties', 'semantics', 'closure']),
						KeyExpression: convertSQLExpressionToXmla(level.keyExpression),
						NameExpression: convertSQLExpressionToXmla(level.nameExpression),
						CaptionExpression: convertSQLExpressionToXmla(level.captionExpression),
						OrdinalExpression: convertSQLExpressionToXmla(level.ordinalExpression),
						ParentExpression: convertSQLExpressionToXmla(level.parentExpression),
						Property: level.properties?.filter(nonBlank)?.map((property) => ({
							...omit(property, ['propertyExpression']),
							PropertyExpression: convertSQLExpressionToXmla(property.propertyExpression)
						})),
						Closure: convertClosureToXmla(level.closure)
					}))
				} as unknown as MDX.Hierarchy)
		)
	} as MDX.Dimension
}

export function convertMeasureToXmla(measure: any): MDX.Measure {
	return measure ? {
		...omit(measure, ['measureExpression']),
		MeasureExpression: convertSQLExpressionToXmla(measure.measureExpression),
	} as MDX.Measure : null
}

export function convertCalculatedMemberToXmla(calculatedMember: any): MDX.CalculatedMember {
	const CalculatedMemberProperty: MDX.CalculatedMemberProperty[] = []
	if (calculatedMember.dataType) {
		CalculatedMemberProperty.push({
			name: 'DATATYPE',
			value: calculatedMember.dataType
		})
	}

	if (calculatedMember.formatString || calculatedMember.formatting?.unit === '%' ||
		calculatedMember.formatting?.unit === 'percent') {
		CalculatedMemberProperty.push({
			name: 'FORMAT_STRING',
			value: calculatedMember.formatString || 'Percent'
		})
	}

	if (calculatedMember.solveOrder) {
		CalculatedMemberProperty.push({
			name: 'SOLVE_ORDER',
			value: calculatedMember.solveOrder
		})
	}

	calculatedMember.calculatedProperties?.forEach((property) => CalculatedMemberProperty.push(property))
	return {
		...omit(calculatedMember, ['calculatedProperties', 'formatting']),
		dimension: calculatedMember.dimension === 'Measures' ? 'Measures' : 
			calculatedMember.hierarchy ? null : (calculatedMember.dimension || 'Measures'),
		hierarchy: calculatedMember.dimension === 'Measures' ? null : calculatedMember.hierarchy,
		CalculatedMemberProperty
	} as MDX.CalculatedMember
}

/**
 * 内容兼容 content 和 _
 * 
 * @param input 
 * @returns 
 */
export function convertSQLExpressionToXmla(input: SQLExpression): MDX.SQLExpression {
	const sqls = input?.sql
	if (Array.isArray(sqls)) {
		return {
			SQL: sqls.map((item) => ({
				dialect: item.dialect,
				_: item.content || item._
			}))
		}
	}
	return (input?.sql?.content || input?.sql?._)
		? {
				SQL: {
					dialect: input.sql?.dialect,
					_: input.sql?.content || input.sql?._
				}
		  }
		: null
}

export function convertJoinToXmla(input: any): MDX.Join {
	return input
		? {
			...omit(input, ['tables']),
			Table: input.tables
		  }
		: null
}

export function convertClosureToXmla(closure): Partial<MDX.Closure> {
	return closure ? {
		...omit(closure, ['table']),
		Table: closure.table
	} : null
}

export function convertTablesJoinToXmla(tables: any[]): MDX.Join {
	if (tables?.length > 1) {
		return tables.slice(0, tables.length - 1).reduceRight((prevValue, currValue) => {
			const result = {
				Join: {
				} as MDX.Join,
				__join__: currValue.join
			}
			if (prevValue.Table) {
				result.Join = {
					leftKey: prevValue.__join__.fields[0]?.leftKey,
					rightKey: prevValue.__join__.fields[0]?.rightKey,
					Table: [
						{name: currValue.name},
						prevValue.Table
					]
				}
			} else if(prevValue.Join) {
				result.Join = {
					leftKey: prevValue.__join__.fields[0]?.leftKey,
					rightKey: prevValue.__join__.fields[0]?.rightKey,
					Table: {name: currValue.name},
					Join: prevValue.Join
				}
			}
			return result
		}, {
			Table: {name: tables[tables.length - 1].name},
			__join__: tables[tables.length - 1].join
		})
	}

	return {
		Table: tables?.map((table) => ({
			name: table.name
		})),
	}
}

export function convertSchemaRolesToXmla(roles: IModelRole[]): MDX.Role[] {
	return [
		...roles.filter((role) => role.type !== RoleTypeEnum.union && role.options?.schemaGrant).map((role) => {
			return {
				name: role.name,
				SchemaGrant: [
					{
						access: role.options.schemaGrant.access,
						CubeGrant: role.options.schemaGrant.cubeGrants.map((cubeGrant) => {
							return {
								...omit(cubeGrant, 'hierarchyGrants'),
								HierarchyGrant: cubeGrant.hierarchyGrants.map((hierarchyGrant) => {
									return {
										...omit(hierarchyGrant, 'memberGrants'),
										MemberGrant: hierarchyGrant.access === MDX.Access.custom ? hierarchyGrant.memberGrants : null
									}
								})
							}
						})
					}
				]
			}
		}),
		...roles.filter((role) => role.type === RoleTypeEnum.union && role.options?.roleUsages)
			// 按是否包含进行先后排序
			.sort((a, b) => {
				if (a.type === RoleTypeEnum.union) {
					const index = a.options.roleUsages.findIndex((item) => item === b.name)
					if (index > -1) {
						return 1
					}
				}
				if (b.type === RoleTypeEnum.union) {
					const index = b.options.roleUsages.findIndex((item) => item === a.name)
					if (index > -1) {
						return -1
					}
				}
				return 0
			})
			.map((role) => {
				return {
					name: role.name,
					Union: [{
						RoleUsage: role.options.roleUsages.map((roleName) => ({
							roleName
						}))
					}]
				}
		})
	] as any
}
