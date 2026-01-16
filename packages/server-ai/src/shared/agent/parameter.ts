import { TXpertParameter, XpertParameterTypeEnum } from "@metad/contracts"
import { z } from 'zod'
import { ARRAY_FILE_ITEMS } from "./constants"

/**
 * Create zod schema for custom parameters of agent
 *
 * @param parameters
 * @returns
 */
export function createParameters(parameters: TXpertParameter[]): Record<string, z.ZodTypeAny> {
	return parameters?.reduce((schema, parameter) => {
		let value = null
		switch (parameter.type) {
			case XpertParameterTypeEnum.STRING:
			case XpertParameterTypeEnum.TEXT:
			case XpertParameterTypeEnum.PARAGRAPH: {
				value = z.string()
				break
			}
			case XpertParameterTypeEnum.BOOLEAN: {
				value = z.boolean()
				break
			}
			case XpertParameterTypeEnum.NUMBER: {
				value = z.number()
				break
			}
			case XpertParameterTypeEnum.SELECT: {
				// If options are provided and not empty, use enum validation
				// Otherwise, fall back to string type to avoid runtime errors
				if (parameter.options && parameter.options.length > 0) {
					value = z.enum(parameter.options as any)
				} else {
					value = z.string()
				}
				break
			}
			case XpertParameterTypeEnum.ARRAY_STRING: {
				value = z.array(z.string())
				break
			}
			case XpertParameterTypeEnum.ARRAY: {
				value = z.array(
					parameter.item?.length ? z.object(createParameters(parameter.item)) : z.record(z.any())
				)
				break
			}
			case XpertParameterTypeEnum.OBJECT: {
				value = parameter.item?.length ? z.object(createParameters(parameter.item)) : z.record(z.any())
				break
			}
		}

		if (value) {
			if (parameter.optional) {
				schema[parameter.name] = value.optional().nullable().describe(parameter.description)
			} else {
				schema[parameter.name] = value.describe(parameter.description)
			}
		}

		return schema
	}, {})
}

/**
 * Complete parameter definitions, such as adding a list of file fields to file array.
 *
 * @param parameters
 * @returns
 */
export function completeParametersDef(parameters: TXpertParameter[]): TXpertParameter[] {
	return parameters.map((parameter) => {
		const completedParameter = { ...parameter }
		if (
			parameter.type === XpertParameterTypeEnum.ARRAY_FILE &&
			(!parameter.item || parameter.item.length === 0)
		) {
			completedParameter.item = ARRAY_FILE_ITEMS
		}
		return completedParameter
	})
}
