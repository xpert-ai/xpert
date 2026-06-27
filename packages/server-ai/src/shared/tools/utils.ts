import type { z as z3 } from "zod/v3";
import { type JsonSchema7Type } from "zod-to-json-schema";
import { zodToJsonSchema } from 'zod-to-json-schema'

export class ToolSchemaParser {
	static parseZodToJsonSchema(schema: z3.ZodTypeAny | JsonSchema7Type) {
		if (!isZodSchema(schema)) {
			return JSON.parse(JSON.stringify(schema))
		}

		return zodToJsonSchema(schema)
	}

	static serializeJsonSchema(schema) {
		return JSON.stringify(schema, null, 2)
	}
}

export function toolNamePrefix(prefix: string, name: string) {
	return `${prefix ? prefix + '__' : ''}${name}`
}

function isZodSchema(schema: z3.ZodTypeAny | JsonSchema7Type): schema is z3.ZodTypeAny {
	return typeof schema === 'object' && schema !== null && '_def' in schema
}
