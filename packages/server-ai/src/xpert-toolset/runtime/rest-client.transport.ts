// Invariants: only a catalog-built URL reaches transport; redirects and caller headers are absent.
// Credentials remain server-side. Bound response bytes and discard non-JSON or failed HTTP responses.
import { Injectable } from '@nestjs/common'
import axios from 'axios'
import { z } from 'zod/v3'
import { apiKeyHeaders } from '../provider/openapi/api-key-headers'
import { json, type serializeRequest } from './rest-client.schema'

const authSchema = z.object({ auth_type: z.enum(['none', 'api_key']).default('none') })
@Injectable()
export class RestClientTransport {
    async request(
        input: ReturnType<typeof serializeRequest>,
        credentials: unknown,
        signal: AbortSignal,
        timeoutMs: number
    ) {
        const auth = authSchema.parse(credentials ?? {})
        const headers = auth.auth_type === 'api_key' ? apiKeyHeaders(credentials) : {}
        if (
            Object.keys(headers).some((key) =>
                /^(host|cookie|content-type|content-length|connection|transfer-encoding|proxy-.*|forwarded|x-forwarded-.*)$/i.test(
                    key
                )
            )
        )
            throw new Error('REST_CLIENT_AUTH_INVALID')
        const response = await axios.request<string>({
            url: input.url,
            method: input.method,
            headers: {
                ...headers,
                Accept: 'application/json',
                ...(input.body !== undefined ? { 'Content-Type': 'application/json' } : {})
            },
            data: input.body === undefined ? undefined : JSON.stringify(input.body),
            signal,
            timeout: timeoutMs,
            maxRedirects: 0,
            maxContentLength: 2_500_000,
            maxBodyLength: 64000,
            responseType: 'text',
            transformResponse: (value) => value,
            validateStatus: () => true
        })
        if (response.status < 200 || response.status >= 300) throw new Error('REST_CLIENT_HTTP_ERROR')
        const contentType: unknown = response.headers['content-type']
        if (typeof contentType !== 'string' || !/^application\/(?:[\w.-]+\+)?json(?:\s*;|$)/i.test(contentType))
            throw new Error('REST_CLIENT_JSON_REQUIRED')
        if (typeof response.data !== 'string' || Buffer.byteLength(response.data) > 2_500_000)
            throw new Error('REST_CLIENT_SIZE_LIMIT')
        return { body: json.parse(JSON.parse(response.data)), sourceFetchedAt: new Date().toISOString() }
    }
}
