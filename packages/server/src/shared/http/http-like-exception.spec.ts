import { BadRequestException, HttpException } from '@nestjs/common'
import { normalizeHttpException } from './http-like-exception'

describe('normalizeHttpException', () => {
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
