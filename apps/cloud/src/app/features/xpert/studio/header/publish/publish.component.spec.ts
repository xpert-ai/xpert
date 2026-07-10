import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('XpertPublishVersionComponent layout', () => {
  const template = readFileSync(join(__dirname, 'publish.component.html'), 'utf8')
  const styles = readFileSync(join(__dirname, 'publish.component.scss'), 'utf8')

  it('keeps publish actions visible while the dialog body scrolls', () => {
    expect(styles).toContain('max-h-[calc(100vh-4rem)]')

    const bodyClasses = classAttributeFor('<div class="relative flex')

    expect(bodyClasses).toEqual(expect.arrayContaining(['flex-1', 'min-h-0', 'overflow-y-auto']))

    const actionsClasses = classAttributeFor('<div class="w-full')

    expect(actionsClasses).toContain('shrink-0')
  })

  function classAttributeFor(fragment: string) {
    const start = template.indexOf(fragment)
    if (start < 0) {
      throw new Error(`Could not find template fragment: ${fragment}`)
    }

    const tagEnd = template.indexOf('>', start)
    const tag = template.slice(start, tagEnd)
    const match = tag.match(/class="([^"]*)"/)
    if (!match) {
      throw new Error(`Could not find class attribute for template fragment: ${fragment}`)
    }

    return match[1].split(/\s+/)
  }
})
