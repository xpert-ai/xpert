import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('CopilotBasicComponent', () => {
  it('refreshes the copilot list when a nested copilot form saves', () => {
    const template = readFileSync(join(__dirname, 'basic.component.html'), 'utf8')
    const formTemplate = readFileSync(join(__dirname, '../copilot-form/copilot-form.component.html'), 'utf8')

    expect(formTemplate).toContain('(saved)="saved.emit()"')
    expect(template.match(/<xp-copilot-form[^>]*\(saved\)="copilotServer\.refresh\(\)"/g) ?? []).toHaveLength(2)
  })
})
