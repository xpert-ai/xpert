// Why this exists: the MCP SDK's default diagnostics can omit missing/extra field names.
// Replace its input validator so clients can repair arguments before business execution.
// Report bounded field paths and constraints, never submitted values or full arguments.
import { fromJsonSchema, type JsonSchemaType, type jsonSchemaValidator } from '@modelcontextprotocol/server'
import Ajv, { type ErrorObject } from 'ajv'
import Ajv2019 from 'ajv/dist/2019'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { t } from 'i18next'

// Keep schema-dialect compatibility without coercing, removing or defaulting input values.
// allErrors gathers the full failure count; inputDiagnostics bounds only the returned details.
const options = { strict: false, validateSchema: false, allErrors: true }
const engines = {
    draft7: addFormats(new Ajv(options)),
    draft2019: addFormats(new Ajv2019(options)),
    draft2020: addFormats(new Ajv2020(options))
}
const validator: jsonSchemaValidator = {
    getValidator<T>(schema: JsonSchemaType) {
        const dialect =
            typeof schema.$schema === 'string'
                ? schema.$schema.replace(/#$/, '').replace(/^http:/, 'https:')
                : undefined
        const engine =
            !dialect || dialect === 'https://json-schema.org/draft/2020-12/schema'
                ? engines.draft2020
                : dialect === 'https://json-schema.org/draft/2019-09/schema'
                  ? engines.draft2019
                  : dialect === 'https://json-schema.org/draft-07/schema' ||
                      dialect === 'https://json-schema.org/draft-06/schema'
                    ? engines.draft7
                    : null
        if (!engine)
            throw new Error(
                t('server-ai:Error.McpUnsupportedSchemaDialect', {
                    dialect: dialect?.slice(0, 200),
                    defaultValue: 'Unsupported JSON Schema dialect: {{dialect}}.'
                })
            )
        const validate = engine.compile<T>(schema)
        return (input: unknown) =>
            validate(input)
                ? { valid: true, data: input, errorMessage: undefined }
                : { valid: false, data: undefined, errorMessage: inputDiagnostics(validate.errors ?? []) }
    }
}

export function mcpInputSchema(schema: JsonSchemaType) {
    return fromJsonSchema(schema, validator)
}

function inputDiagnostics(errors: ErrorObject[]) {
    return JSON.stringify({
        errorCode: 'invalid_tool_arguments',
        issues: errors.slice(0, 20).map((issue) => {
            // Ajv points these errors at the parent object; append the offending JSON Pointer segment.
            const extra =
                issue.keyword === 'required'
                    ? issue.params.missingProperty
                    : issue.keyword === 'additionalProperties'
                      ? issue.params.additionalProperty
                      : undefined
            const path =
                issue.instancePath +
                (typeof extra === 'string' ? `/${extra.replace(/~/g, '~0').replace(/\//g, '~1')}` : '')
            return {
                path: path.slice(0, 1000) || '/',
                code: issue.keyword,
                message:
                    issue.message?.slice(0, 500) ??
                    t('server-ai:Error.McpInvalidArgumentValue', { defaultValue: 'Invalid value' }),
                ...(issue.keyword === 'enum' && Array.isArray(issue.params.allowedValues)
                    ? {
                          allowedValues: issue.params.allowedValues
                              .slice(0, 20)
                              .filter(
                                  (value) =>
                                      typeof value === 'string' ||
                                      typeof value === 'number' ||
                                      typeof value === 'boolean'
                              )
                              .map((value) => (typeof value === 'string' ? value.slice(0, 100) : value))
                      }
                    : {})
            }
        }),
        issueTotal: errors.length,
        truncated: errors.length > 20
    })
}
