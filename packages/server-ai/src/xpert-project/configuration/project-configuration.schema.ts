import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { projectConfigurationValuesSchema, projectTaskDurationSchema,
    type JsonSchemaObjectType, type ProjectConfigurationValues,
    type XpertProjectTypeConfigurationDefinition } from '@xpert-ai/contracts'

export const configurationInvalid = () => new BadRequestException(t('server-ai:Error.ProjectConfigurationInvalid'))
const createValidator = () => {
    const validator = new Ajv({ strict: false, strictSchema: true, validateSchema: false, useDefaults: true, ownProperties: true })
    validator.addKeyword('x-ui')
    return addFormats(validator)
}

/** Loaded plugin metadata is trusted code, but malformed declarations must fail at this boundary. */
export function parseProjectConfigurationDefinition(value: unknown): XpertProjectTypeConfigurationDefinition | undefined {
    if (value === undefined) return undefined
    if (!value || typeof value !== 'object' || !('schema' in value)) throw configurationInvalid()
    const schema = value.schema
    if (!schema || typeof schema !== 'object' || !('type' in schema) || schema.type !== 'object' ||
        !('properties' in schema) || !schema.properties || typeof schema.properties !== 'object' ||
        Array.isArray(schema.properties) || JSON.stringify(schema).length > 65536) throw configurationInvalid()
    try {
        const validate = createValidator().compile(schema)
        if ('$async' in validate && validate.$async) throw configurationInvalid()
    } catch { throw configurationInvalid() }
    return { schema: schema as JsonSchemaObjectType }
}

export function effectiveProjectConfiguration(schema: JsonSchemaObjectType | undefined,
    values: ProjectConfigurationValues): ProjectConfigurationValues {
    const parsed = projectConfigurationValuesSchema.safeParse(values)
    if (!parsed.success) throw configurationInvalid()
    const result = parsed.data
    if (!schema) {
        if (Object.keys(result).length) throw configurationInvalid()
        return result
    }
    try {
        const validate = createValidator().compile(schema)
        if (('$async' in validate && validate.$async) || validate(result) !== true) throw configurationInvalid()
    } catch { throw configurationInvalid() }
    if (result.taskExecutionMaxDurationSeconds !== undefined &&
        !projectTaskDurationSchema.safeParse(result.taskExecutionMaxDurationSeconds).success) throw configurationInvalid()
    const effective = projectConfigurationValuesSchema.safeParse(result)
    if (!effective.success) throw configurationInvalid()
    return effective.data
}
