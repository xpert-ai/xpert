import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('XpertStudioComponent template', () => {
  const template = readFileSync(join(__dirname, 'studio.component.html'), 'utf8')

  it('does not render a separate canvas version badge', () => {
    expect(template).not.toContain('data-testid="xpert-studio-canvas-version"')
  })
})
