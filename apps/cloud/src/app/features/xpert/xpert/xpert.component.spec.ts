import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('XpertComponent template', () => {
  const template = readFileSync(join(__dirname, 'xpert.component.html'), 'utf8')

  it('shows the published version next to the xpert type badge only when a version exists', () => {
    const start = template.indexOf('<div class="flex items-center text-xs')
    const end = template.indexOf('</div>\n      </div>', start)
    const typeBadgeRow = template.slice(start, end)

    expect(typeBadgeRow).toContain('{{xpert()?.type}}')
    expect(typeBadgeRow).toContain('@if (xpert()?.version)')
    expect(typeBadgeRow).toContain('v{{ xpert()?.version }}')
  })
})
