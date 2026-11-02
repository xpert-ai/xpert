import { QueryFailedError } from 'typeorm'

export function getQueryFailedErrorCode(error: QueryFailedError) {
    const driverError: unknown = error.driverError
    if (!driverError || typeof driverError !== 'object') {
        return null
    }
    if ('code' in driverError && (typeof driverError.code === 'string' || typeof driverError.code === 'number')) {
        return driverError.code
    }
    if ('errno' in driverError && (typeof driverError.errno === 'string' || typeof driverError.errno === 'number')) {
        return driverError.errno
    }
    return null
}
