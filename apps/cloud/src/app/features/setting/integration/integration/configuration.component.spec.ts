jest.mock('echarts/core', () => ({ registerTheme: jest.fn() }))

import type { TIntegrationProvider } from '@xpert-ai/contracts'
import { resolveProviderHelpLinks } from './configuration.component'

describe('resolveProviderHelpLinks', () => {
  const provider = (input: Partial<TIntegrationProvider>): TIntegrationProvider => ({
    name: 'example',
    label: { en_US: 'Example' },
    ...input
  })

  it('uses provider-defined help links before the legacy help URL', () => {
    const helpLinks = [
      { url: 'https://example.com/setup', label: { en_US: 'Setup' } },
      { url: 'https://example.com/oauth', label: { en_US: 'OAuth' } }
    ]

    expect(
      resolveProviderHelpLinks(
        provider({
          helpLinks,
          helpUrl: 'https://example.com/legacy',
          helpLabel: { en_US: 'Legacy' }
        })
      )
    ).toEqual(helpLinks)
  })

  it('falls back to the legacy help URL when help links are missing or empty', () => {
    const expected = [{ url: 'https://example.com/legacy', label: { en_US: 'Legacy' } }]

    expect(
      resolveProviderHelpLinks(
        provider({
          helpUrl: 'https://example.com/legacy',
          helpLabel: { en_US: 'Legacy' }
        })
      )
    ).toEqual(expected)
    expect(
      resolveProviderHelpLinks(
        provider({
          helpLinks: [],
          helpUrl: 'https://example.com/legacy',
          helpLabel: { en_US: 'Legacy' }
        })
      )
    ).toEqual(expected)
  })

  it('returns no links when the provider has no help metadata', () => {
    expect(resolveProviderHelpLinks(provider({}))).toEqual([])
  })
})
