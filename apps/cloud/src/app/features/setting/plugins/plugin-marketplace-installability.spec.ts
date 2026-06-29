import { hasInstallableMarketplaceContribution } from './plugin-marketplace-installability'

const displayOnlyTypes = ['app', 'tool', 'view', 'feature', 'middleware'] as const
const shortcutTypes = ['assistant-template', 'skill', 'hook'] as const

describe('plugin marketplace installability', () => {
  it.each(displayOnlyTypes)('does not treat display-only %s content as marketplace-installable', (type) => {
    expect(
      hasInstallableMarketplaceContribution({
        type,
        name: `${type}-content`
      })
    ).toBe(false)
  })

  it.each(shortcutTypes)('keeps %s marketplace shortcuts installable', (type) => {
    expect(
      hasInstallableMarketplaceContribution({
        type,
        name: `${type}-content`
      })
    ).toBe(true)
  })
})
