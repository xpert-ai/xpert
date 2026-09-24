import { BadRequestException, HttpException } from '@nestjs/common'
import { t } from 'i18next'

const messages = {
    INVALID_MESSAGE: 'Invalid desktop shell request.',
    INVALID_SETTINGS: 'Invalid Shell settings.',
    DEVICE_OFFLINE: 'This computer is offline. Open Xpert Desktop and enable Shell.',
    DEVICE_BUSY: 'This computer is already running a command.',
    GRANT_REVOKED: 'Desktop Shell is not authorized for this conversation.',
    NOT_FOUND: 'The desktop shell operation is unavailable.',
    OPERATION_CONFLICT: 'This operation ID belongs to a different command.',
    OUTPUT_EXPIRED: 'Some command output is no longer available.',
    EXECUTION_UNKNOWN: 'The command result is unknown. It was not executed again.',
    PROTOCOL_MISMATCH: 'Update Xpert Desktop to connect to this service.'
} as const
export type ShellErrorCode = keyof typeof messages
export function shellMessage(code: string): string {
    const fallback = Object.prototype.hasOwnProperty.call(messages, code)
        ? messages[code as ShellErrorCode]
        : 'The desktop shell operation failed.'
    return t(`server-ai:DesktopShell.${code}`, { defaultValue: fallback })
}
export function shellError(code: ShellErrorCode, status = 400): never {
    throw new HttpException({ code, message: shellMessage(code) }, status)
}
export function parseShellBoundary<T>(parse: (input: unknown) => T, input: unknown): T {
    try {
        return parse(input)
    } catch {
        throw new BadRequestException({ code: 'INVALID_MESSAGE', message: shellMessage('INVALID_MESSAGE') })
    }
}
