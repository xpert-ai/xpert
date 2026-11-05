import { localSupervisionFailure } from './local-supervision-support'

it.each(['darwin', 'win32', 'freebsd'] as const)('does not advertise unverifiable execution on %s', (platform) => {
    expect(localSupervisionFailure(platform)).toContain('cannot confirm descendant exit')
})
it('retains Linux subreaper support', () => {
    expect(localSupervisionFailure('linux')).toBeUndefined()
})
