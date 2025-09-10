import { TXpertParameter, XpertParameterTypeEnum } from "@metad/contracts"
import { z } from 'zod'

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
				value = z.enum(parameter.options as any)
				break
			}
			case XpertParameterTypeEnum.ARRAY_STRING: {
				value = z.array(z.string())
				break
			}
			case XpertParameterTypeEnum.ARRAY: {
				value = z.array(z.object(createParameters(parameter.item)))
				break
			}
		}

		if (value) {
			if (parameter.optional) {
				schema[parameter.name] = value.optional().describe(parameter.description)
			} else {
				schema[parameter.name] = value.describe(parameter.description)
			}
		}

		return schema
	}, {})
}
