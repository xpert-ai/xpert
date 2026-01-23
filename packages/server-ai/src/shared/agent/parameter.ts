import { TXpertParameter, XpertParameterTypeEnum } from "@metad/contracts"
import { z } from 'zod'
import { ARRAY_FILE_ITEMS } from "./constants"

/**
 * Validate user-provided parameter values against parameter definitions.
 *
 * English note: This is used as a backend safety net to prevent oversized inputs
 * (e.g., string length > maximum) from silently passing into the agent runtime.
 */
export function validateXpertParameterValues(
	parameters: TXpertParameter[] | undefined | null,
	values: Record<string, unknown> | undefined | null
): void {
	if (!parameters?.length || !values) {
		return
	}

	for (const parameter of parameters) {
		// Only validate provided values; do not enforce "required" here to avoid behavior changes.
		const raw = (values as any)?.[parameter.name]
		if (raw == null) {
			continue
		}

		const maximum = typeof parameter.maximum === 'number' ? parameter.maximum : null
		if (!maximum || !Number.isFinite(maximum)) {
			continue
		}

		if (
			parameter.type === XpertParameterTypeEnum.STRING ||
			parameter.type === XpertParameterTypeEnum.TEXT ||
			parameter.type === XpertParameterTypeEnum.PARAGRAPH ||
			parameter.type === XpertParameterTypeEnum.SECRET
		) {
			if (typeof raw === 'string' && raw.length > maximum) {
				throw new Error(`Parameter "${parameter.name}" length should not be greater than ${maximum}`)
			}
		} else if (parameter.type === XpertParameterTypeEnum.NUMBER) {
			// English note: For NUMBER type, "maximum" means max digit length (not numeric value).
			// We count only digits 0-9, ignoring sign and decimal separator.
			const str = typeof raw === 'number' ? String(raw) : String(raw ?? '')
			const digitLength = (str.match(/\d/g) ?? []).length
			if (digitLength > maximum) {
				throw new Error(`Parameter "${parameter.name}" digit length should not be greater than ${maximum}`)
			}
		}
	}
}

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
				// English note: "maximum" is used by the UI as maxLength for string-like parameters.
				if (typeof parameter.maximum === 'number' && Number.isFinite(parameter.maximum)) {
					value = value.max(parameter.maximum, {
						message: `Parameter "${parameter.name}" length should not be greater than ${parameter.maximum}`
					})
				}
				break
			}
			case XpertParameterTypeEnum.BOOLEAN: {
				value = z.boolean()
				break
			}
			case XpertParameterTypeEnum.NUMBER: {
				value = z.number()
				// English note: For NUMBER type, "maximum" means max digit length (not numeric value).
				// Note: Leading zeros are not preserved when the value is a number.
				if (typeof parameter.maximum === 'number' && Number.isFinite(parameter.maximum)) {
					value = value.refine(
						(num) => {
							const str = String(num)
							const digitLength = (str.match(/\d/g) ?? []).length
							return digitLength <= parameter.maximum
						},
						{
							message: `Parameter "${parameter.name}" digit length should not be greater than ${parameter.maximum}`
						}
					)
				}
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
