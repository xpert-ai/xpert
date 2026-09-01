import { ProjectTaskInstruction } from './supervisor'

describe('ProjectTaskInstruction', () => {
    it('keeps Project experts peer-based without reviving a privileged assistant role', () => {
        expect(ProjectTaskInstruction).toContain('Project experts are peers')
        expect(ProjectTaskInstruction).toContain('another project expert')
        expect(ProjectTaskInstruction.toLowerCase()).not.toContain('you are the project assistant')
    })
})
