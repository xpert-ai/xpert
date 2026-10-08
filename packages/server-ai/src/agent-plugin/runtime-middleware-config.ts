// Invariants: an existing Assistant middleware owns its complete effective configuration.
// New plugin providers must agree after defaults; inputs and published graphs stay unchanged.
import { BadRequestException } from '@nestjs/common'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import Ajv from 'ajv'
import { t } from 'i18next'
import { cloneDeep, isEqual } from 'lodash'

type MiddlewareOptions = Record<string, unknown>

export function mergeRuntimeMiddlewareOptions(
    provider: string,
    assistantOptions: MiddlewareOptions | undefined,
    pluginOptions: MiddlewareOptions[],
    meta?: TAgentMiddlewareMeta
): MiddlewareOptions {
    const validator = meta?.configSchema
        ? new Ajv({ strict: false, validateSchema: false, useDefaults: true, ownProperties: true }).compile(
              meta.configSchema
          )
        : undefined
    const normalize = (options: MiddlewareOptions): MiddlewareOptions => {
        const result = cloneDeep(Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)))
        if (validator && !validator(result)) {
            throw new BadRequestException(
                t('server-ai:Error.AgentResourceMergedConfigInvalid', {
                    provider,
                    defaultValue:
                        'The effective configuration for {{provider}} is invalid. Check the Assistant and selected plugin settings.'
                })
            )
        }
        return result
    }
    if (assistantOptions !== undefined) return normalize(assistantOptions)

    const options = pluginOptions.map(normalize)
    const effective = options[0] ?? normalize({})
    for (const candidate of options.slice(1)) {
        for (const field of new Set([...Object.keys(effective), ...Object.keys(candidate)])) {
            if (!isEqual(effective[field], candidate[field])) {
                throw new BadRequestException(
                    t('server-ai:Error.AgentResourcePluginConfigConflict', {
                        provider,
                        field,
                        defaultValue:
                            'Selected plugins disagree on {{provider}}.{{field}}. Configure it explicitly on the Assistant or change the plugin selection.'
                    })
                )
            }
        }
    }
    return effective
}
