import { SandboxJobProgressDecoder, lifecycleSandboxJobProgress, parseSandboxJobProgress } from './sandbox-job-progress'

describe('Sandbox Job structured progress', () => {
    it('decodes a progress line split across Runtime output chunks', () => {
        const decoder = new SandboxJobProgressDecoder()

        expect(decoder.push({ stream: 'stdout', text: 'XPERT_SANDBOX_PROG' })).toEqual([])
        expect(
            decoder.push({
                stream: 'stdout',
                text: 'RESS {"progress":0.25,"stage":"rendering","current":25,"total":100}\n'
            })
        ).toEqual([{ progress: 0.25, stage: 'rendering', current: 25, total: 100 }])
    })

    it('rejects malformed, unbounded, and inconsistent progress payloads', () => {
        expect(parseSandboxJobProgress('CUT_RENDER_PROGRESS {"progress":0.2}')).toBeNull()
        expect(parseSandboxJobProgress('XPERT_SANDBOX_PROGRESS {"progress":2}')).toBeNull()
        expect(parseSandboxJobProgress('XPERT_SANDBOX_PROGRESS {"progress":0.2,"current":3}')).toBeNull()
        expect(
            parseSandboxJobProgress(
                `XPERT_SANDBOX_PROGRESS ${JSON.stringify({ progress: 0.2, stage: 'x'.repeat(65) })}`
            )
        ).toEqual({ progress: 0.2 })
    })

    it('preserves the last ratio while moving through Core lifecycle stages', () => {
        expect(lifecycleSandboxJobProgress({ progress: 0.42, stage: 'rendering' }, 'failed')).toMatchObject({
            progress: 0.42,
            stage: 'failed',
            updatedAt: expect.any(String)
        })
    })
})
