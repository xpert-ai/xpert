import { BadRequestException, HttpException } from '@nestjs/common'
import { QueryFailedError } from 'typeorm'
import { normalizeHttpException } from './http-like-exception'

describe('normalizeHttpException', () => {
    it('maps a TypeORM database quota failure to 413 without exposing query details', () => {
        const error = new QueryFailedError('private SQL', ['private parameter'],
            Object.assign(new Error('APP_PLATFORM_FAILURE:application_storage_limit'), {
                code: 'P0001', detail: 'private detail'
            }))
        const normalized = normalizeHttpException(error)
        expect(normalized?.getStatus()).toBe(413)
        expect(normalized?.getResponse()).toMatchObject({ code: 'application_storage_limit' })
        expect(Object.keys(normalized.getResponse())).toEqual(['code', 'message'])
        const response = JSON.stringify(normalized.getResponse())
        for (const internal of ['private SQL', 'private parameter', 'private detail', 'APP_PLATFORM_FAILURE']) {
            expect(response).not.toContain(internal)
        }
    })

    it.each([
        { code: 'P0001', message: 'other database error' },
        { code: '23505', message: 'APP_PLATFORM_FAILURE:application_storage_limit' },
        { code: 'P0001', message: 'APP_PLATFORM_FAILURE:application_storage_limit: unexpected suffix' },
        { message: 'APP_PLATFORM_FAILURE:application_storage_limit' }
    ])('does not classify unrelated database errors as quota failures: %j', (error) => {
        expect(normalizeHttpException(error)).toBeNull()
    })

    it('returns existing Nest http exceptions unchanged', () => {
        const exception = new BadRequestException('Invalid path')

        expect(normalizeHttpException(exception)).toBe(exception)
    })

    it('normalizes errors with a status property', () => {
        class DockerSandboxHttpError extends Error {
            readonly status = 404

            constructor(message: string) {
                super(message)
                this.name = 'DockerSandboxHttpError'
            }
        }

        const normalized = normalizeHttpException(new DockerSandboxHttpError('Workspace not found'))

        expect(normalized).toBeInstanceOf(HttpException)
        expect(normalized?.getStatus()).toBe(404)
        expect(normalized?.message).toBe('Workspace not found')
    })

    it('preserves structured response bodies on statusCode errors', () => {
        const normalized = normalizeHttpException({
            statusCode: 409,
            response: {
                message: 'Workspace is busy',
                error: 'Conflict'
            }
        })

        expect(normalized).toBeInstanceOf(HttpException)
        expect(normalized?.getStatus()).toBe(409)
        expect(normalized?.getResponse()).toEqual({
            message: 'Workspace is busy',
            error: 'Conflict'
        })
    })

    it('ignores non http-like errors', () => {
        expect(normalizeHttpException(new Error('Unexpected failure'))).toBeNull()
    })
})
