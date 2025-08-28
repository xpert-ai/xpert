import type { z as z3 } from "zod/v3";
import { type JsonSchema7Type } from "zod-to-json-schema";
import { zodToJsonSchema } from 'zod-to-json-schema'

export class ToolSchemaParser {
	static parseZodToJsonSchema(schema: z3.ZodTypeAny | JsonSchema7Type) {
		const jsonSchema = zodToJsonSchema(schema as any)
		return jsonSchema
	}

	static serializeJsonSchema(schema) {
		return JSON.stringify(schema, null, 2)
	}
}

export function toolNamePrefix(prefix: string, name: string) {
	return `${prefix ? prefix + '__' : ''}${name}`
}
