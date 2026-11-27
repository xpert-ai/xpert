import { fileToolDisplay, toolInputTarget } from './tool-display'

describe('tool-owned input targets', () => {
    it('preserves shell escapes and search expressions as text', () => {
        const command = String.raw`printf '%s\n' "C:\temp\file.txt"`
        expect(toolInputTarget('command')({ command })).toBe(command)
        const pattern = String.raw`\bvalue\s+\d+\b`
        expect(fileToolDisplay('sandbox_grep', 'search', 'pattern', false).target({ pattern })).toBe(pattern)
    })

    it('compacts declared paths without modifying the input', () => {
        const input = { path: String.raw`C:\workspace\live-dashboard\SKILL.md` }
        expect(toolInputTarget('path', true)(input)).toBe('live-dashboard/SKILL.md')
        expect(input.path).toBe(String.raw`C:\workspace\live-dashboard\SKILL.md`)
        expect(toolInputTarget('path', true)({ path: '/workspace/live-dashboard/SKILL.md' })).toBe(
            'live-dashboard/SKILL.md'
        )
    })
})
