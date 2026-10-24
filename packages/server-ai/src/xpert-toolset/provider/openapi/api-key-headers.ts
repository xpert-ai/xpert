import { z } from 'zod/v3'
import { t } from 'i18next'
import { ToolProviderCredentialValidationError } from '../../errors'

/** @deprecated Stored `bearar` is the legacy UI spelling of `bearer`; empty values mean no prefix. */
const prefixSchema = z
    .enum(['basic', 'bearer', 'custom', 'bearar', ''])
    .nullish()
    .transform((value) => (value === 'bearar' ? 'bearer' : value || undefined))

const schema = z.object({
    api_key_header: z.string().nullish(),
    api_key_value: z.string().min(1),
    api_key_header_prefix: prefixSchema
})

/** Assemble a fresh header map without modifying the stored credential or duplicating prefixes. */
export function apiKeyHeaders(input: unknown): Record<string, string> {
    const parsed = schema.safeParse(input)
    if (!parsed.success) throw invalidCredentials()
    const credential = parsed.data
    const name = credential.api_key_header || 'api_key'
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || /[\r\n]/.test(credential.api_key_value))
        throw invalidCredentials()
    const prefix =
        credential.api_key_header_prefix === 'basic'
            ? 'Basic '
            : credential.api_key_header_prefix === 'bearer'
              ? 'Bearer '
              : ''
    return { [name]: prefix + credential.api_key_value }
}

function invalidCredentials() {
    return new ToolProviderCredentialValidationError(
        t('server-ai:Error.ApiKeyCredentialsInvalid', {
            defaultValue: 'API key credentials are invalid.'
        })
    )
}
