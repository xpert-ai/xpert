import { HttpException } from '@nestjs/common'

export function normalizeHttpException(exception: unknown): HttpException | null {
    if (exception instanceof HttpException) {
        return exception
    }

    const status = resolveHttpStatus(exception)
    if (status === null) {
        return null
    }

    const response = resolveHttpResponse(exception)
    if (response !== undefined) {
        return new HttpException(response, status)
    }

    return new HttpException(resolveErrorMessage(exception), status)
}

function resolveHttpStatus(exception: unknown): number | null {
    if (!isObjectLike(exception)) {
        return null
    }

    if (hasGetStatus(exception)) {
        const status = exception.getStatus()
        if (isHttpStatusCode(status)) {
            return status
        }
    }

    if (hasStatusProperty(exception) && isHttpStatusCode(exception.status)) {
        return exception.status
    }

    if (hasStatusCodeProperty(exception) && isHttpStatusCode(exception.statusCode)) {
        return exception.statusCode
    }

    return null
}

function resolveHttpResponse(exception: unknown): string | object | undefined {
    if (!isObjectLike(exception) || !hasResponseProperty(exception)) {
        return undefined
    }

    if (typeof exception.response === 'string') {
        return exception.response
    }

    if (isObjectLike(exception.response)) {
        return exception.response
    }

    return undefined
}

function resolveErrorMessage(exception: unknown): string {
    if (exception instanceof Error) {
        const message = exception.message.trim()
        if (message) {
            return message
        }
    }

    if (isObjectLike(exception) && hasMessageProperty(exception) && typeof exception.message === 'string') {
        const message = exception.message.trim()
        if (message) {
            return message
        }
    }

    return 'Internal server error'
}

function isHttpStatusCode(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 400 && value < 600
}

function isObjectLike(value: unknown): value is object {
    return typeof value === 'object' && value !== null
}

function hasGetStatus(value: object): value is { getStatus: () => unknown } {
    return 'getStatus' in value && typeof value.getStatus === 'function'
}

function hasStatusProperty(value: object): value is { status: unknown } {
    return 'status' in value
}

function hasStatusCodeProperty(value: object): value is { statusCode: unknown } {
    return 'statusCode' in value
}

function hasResponseProperty(value: object): value is { response: unknown } {
    return 'response' in value
}

function hasMessageProperty(value: object): value is { message: unknown } {
    return 'message' in value
}
