import type { Socket } from 'node:net'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'

/** Preserve the public reverse-proxy origin for both HTTP and remote-view OAuth. */
export function buildConnectorCallbackUrl(request: {
    protocol?: string
    headers?: { host?: string; 'x-forwarded-proto'?: string | string[]; 'x-forwarded-host'?: string | string[] }
    socket?: Socket
    get?(name: string): string | undefined
}) {
    const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim()
    const protocol = first(request.headers?.['x-forwarded-proto']) || request.protocol || (request.socket && 'encrypted' in request.socket && request.socket.encrypted === true ? 'https' : 'http')
    const host = first(request.headers?.['x-forwarded-host']) || request.get?.('host') || request.headers?.host
    if (!host || !['https','http'].includes(protocol)) throw new BadRequestException(t('server-ai:Error.ConnectorOAuthBrowserBindingInvalid'))
    return new URL('/api/connector/oauth/callback', `${protocol}://${host}`).toString()
}
