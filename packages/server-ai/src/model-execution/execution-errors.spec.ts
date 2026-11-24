import { CliAuthenticationRequiredError, executionError } from './execution-errors'

describe('execution failure attribution', () => {
    it('does not classify an unknown transport outcome as authorization denial', () => {
        expect(executionError('Unknown').getStatus()).toBe(503)
        expect(executionError('Denied').getStatus()).toBe(403)
    })

    it('preserves native sign-in guidance and denial for actual authentication failures', () => {
        for (const reason of ['AuthenticationRequired', 'AuthenticationUnknown'] as const) {
            const error = executionError(reason)
            expect(error).toBeInstanceOf(CliAuthenticationRequiredError)
            expect(error.getStatus()).toBe(403)
        }
    })
})
