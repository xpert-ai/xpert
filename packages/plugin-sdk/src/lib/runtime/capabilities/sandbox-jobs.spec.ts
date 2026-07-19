import { SandboxJobRuntimeError, isSandboxJobRuntimeError } from './sandbox-jobs'

describe('Sandbox Jobs runtime errors', () => {
  it('recognizes errors created by the local SDK constructor', () => {
    expect(
      isSandboxJobRuntimeError(
        new SandboxJobRuntimeError('EXPORT_INPUT_INVALID', 'Invalid Canvas input.', false, 'job-1')
      )
    ).toBe(true)
  })

  it('recognizes the stable error contract across SDK module boundaries', () => {
    const foreignError = Object.assign(new Error('Invalid Canvas input.'), {
      name: 'SandboxJobRuntimeError',
      code: 'EXPORT_INPUT_INVALID',
      retryable: false,
      jobId: 'job-1'
    })

    expect(foreignError).not.toBeInstanceOf(SandboxJobRuntimeError)
    expect(isSandboxJobRuntimeError(foreignError)).toBe(true)
  })

  it('rejects lookalike errors with an unknown code or incomplete policy', () => {
    expect(
      isSandboxJobRuntimeError({
        name: 'SandboxJobRuntimeError',
        message: 'Unknown failure.',
        code: 'UNKNOWN',
        retryable: false
      })
    ).toBe(false)
    expect(
      isSandboxJobRuntimeError({
        name: 'SandboxJobRuntimeError',
        message: 'Missing retry policy.',
        code: 'EXPORT_INPUT_INVALID'
      })
    ).toBe(false)
  })
})
