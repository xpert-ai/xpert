import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('OrganizationSelectorComponent template', () => {
  it('shows organization loading feedback while the menu data request is pending', () => {
    const template = readFileSync(join(__dirname, 'organization-selector.component.html'), 'utf8')

    expect(template).toContain('@if (organizationsLoading())')
    expect(template).toContain('PAC.Organization.Loading')
    expect(template).toContain('ri-loader-4-line')
  })
})
