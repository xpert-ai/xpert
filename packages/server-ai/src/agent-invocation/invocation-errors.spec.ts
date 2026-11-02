import { ForbiddenException, HttpException } from '@nestjs/common'
import { z } from 'zod/v3'
import { AgentInvocationAuthorizationError, AgentInvocationError, invocationFailureReason } from './invocation-errors'

describe('safe invocation failure diagnostics', () => {
    it.each([
        [
            new AgentInvocationAuthorizationError(new ForbiddenException('secret token')),
            'authorization_failed:http_403'
        ],
        [
            new AgentInvocationAuthorizationError(new AgentInvocationError('CallConflict')),
            'authorization_failed:invocation_CallConflict'
        ],
        [
            new AgentInvocationAuthorizationError(new Error('private upstream response')),
            'authorization_failed:unavailable'
        ],
        [new HttpException({ token: 'secret' }, 503), 'http_503'],
        [new z.ZodError([{ code: 'custom', path: ['private-input'], message: 'secret' }]), 'invalid_payload'],
        [new Error('password=secret'), null],
        [{ message: 'secret', status: 403 }, null]
    ])('retains only host-defined reasons for %p', (error, reason) => {
        expect(invocationFailureReason(error)).toBe(reason)
    })
})
