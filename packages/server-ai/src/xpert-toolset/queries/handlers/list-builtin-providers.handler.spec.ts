import fs from 'node:fs'
import path from 'node:path'

describe('builtin scheduler provider migration', () => {
    it('does not expose the legacy task toolset as a builtin provider anymore', () => {
        const source = fs.readFileSync(
            path.resolve(__dirname, '../../provider/builtin/index.ts'),
            'utf8'
        )

        expect(source).not.toContain("./task/task")
        expect(source).not.toContain("import { TaskToolset } from './task/task'")
        expect(source).not.toContain('TaskToolset')
    })
})
