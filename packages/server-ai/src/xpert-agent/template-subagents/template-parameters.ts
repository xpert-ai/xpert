import { BadRequestException } from '@nestjs/common'
import { resolveI18nText, XpertParameterTypeEnum, type TXpertParameter } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import z from 'zod'
import { createParameters } from '../../shared/agent/parameter'

/** Keep the ordinary parameter validators and include the structured input types used by templates. */
export function templateParametersSchema(parameters: TXpertParameter[]): Record<string, z.ZodType> {
    return Object.fromEntries(
        parameters.map((parameter) => {
            const description =
                resolveI18nText(parameter.description, RequestContext.getLanguageCode()) || parameter.name
            let schema: z.ZodType
            const object = () =>
                parameter.item?.length
                    ? z.object(templateParametersSchema(parameter.item)).strict()
                    : z.record(z.unknown())
            switch (parameter.type) {
                case XpertParameterTypeEnum.OBJECT:
                case XpertParameterTypeEnum.FILE:
                    schema = object()
                    break
                case XpertParameterTypeEnum.ARRAY:
                case XpertParameterTypeEnum.ARRAY_FILE:
                case XpertParameterTypeEnum.ARRAY_DOCUMENT:
                case XpertParameterTypeEnum.ARRAY_MESSAGE:
                    schema = z.array(object())
                    break
                case XpertParameterTypeEnum.ARRAY_NUMBER:
                    schema = z.array(z.number())
                    break
                default: {
                    const normalized = {
                        ...parameter,
                        optional: false,
                        description,
                        type:
                            parameter.type === XpertParameterTypeEnum.SECRET
                                ? XpertParameterTypeEnum.STRING
                                : parameter.type
                    }
                    schema = createParameters([normalized])[parameter.name]
                    if (!schema)
                        throw new BadRequestException(
                            t('server-ai:Error.TemplateSubagentParameterInvalid', { name: parameter.name })
                        )
                }
            }
            if (parameter.optional) schema = schema.optional().nullable()
            if (parameter.default !== undefined) schema = schema.default(parameter.default)
            return [parameter.name, schema.describe(description)]
        })
    )
}
