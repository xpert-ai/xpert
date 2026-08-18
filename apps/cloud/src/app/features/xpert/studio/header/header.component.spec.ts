import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('XpertStudioHeaderComponent template', () => {
  const template = readFileSync(join(__dirname, 'header.component.html'), 'utf8')

  it('adds the current version to the published status only when a version exists', () => {
    const start = template.indexOf('@if (latestPublishDate())')
    const end = template.indexOf('<div class="flex-1"></div>', start)
    const publishedStatus = template.slice(start, end)

    expect(publishedStatus).toContain("{{ 'XP.Xpert.Published' | translate: { Default: 'Published' } }}")
    expect(publishedStatus).toContain('@if (version())')
    expect(publishedStatus).toContain('v{{ version() }}')
    expect(publishedStatus).not.toContain('XP.Xpert.Draft')
  })

  it('includes the initial chat layout settings in the agent settings menu', () => {
    const start = template.indexOf('<ng-template #agentMenu')
    const end = template.indexOf('<ng-template #diagramMenu>', start)
    const agentSettings = template.slice(start, end)

    expect(agentSettings).toContain('<xp-xpert-workbench-initial-layout-settings />')
  })
})
