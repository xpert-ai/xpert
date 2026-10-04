import { SystemMessage } from '@langchain/core/messages'
import { withSandboxExecutionContext } from './sandbox-execution-context'

describe('sandbox execution context', () => {
    it('preserves structured system content and supplies only declared capabilities', () => {
        const original = new SystemMessage({ content: [{ type: 'text', text: 'Existing instructions' }] })
        const result = withSandboxExecutionContext(original, {
            homeDirectory: '/home/agent',
            persistentDirectories: ['/home/agent'],
            canInstallSystemPackages: false,
            shellState: 'per-command'
        })
        expect(original.content).toEqual([{ type: 'text', text: 'Existing instructions' }])
        expect(result.content).toEqual([
            original.content[0],
            expect.objectContaining({ type: 'text', text: expect.stringContaining('"canInstallSystemPackages":false') })
        ])
        expect(JSON.stringify(result.content)).not.toContain('Ubuntu')
        expect(JSON.stringify(result.content)).not.toContain('amd64')
    })
    it('does not turn unspecified installation rights into a denial', () => {
        const result = withSandboxExecutionContext(undefined, { os: 'linux' })
        expect(result.content).toContain('{"os":"linux"}')
        expect(result.content).not.toContain('"canInstallSystemPackages":false')
    })

    it('advertises scoped CLI authentication only for a backend with platform models', () => {
        const original = new SystemMessage('Existing instructions')
        const managed = withSandboxExecutionContext(original, { capabilities: ['platform_models'] })
        expect(managed.content).toContain('XPERT_CODING_TOOLS_FILE')
        expect(managed.content).toContain('execution-scoped model credentials')
        expect(managed.content).not.toContain('use its supported user authorization flow')
        const ordinary = withSandboxExecutionContext(original, {})
        expect(ordinary.content).not.toContain('XPERT_CODING_TOOLS_FILE')
        expect(ordinary.content).toContain('actually reports missing authentication')
        expect(original.content).toBe('Existing instructions')
    })
})
