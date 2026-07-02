import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('FeaturesComponent entry onboarding eligibility', () => {
  const readSource = () => readFileSync(join(__dirname, 'features.component.ts'), 'utf8')

  it('does not fetch entry onboarding eligibility during shell initialization', () => {
    const source = readSource()
    const ngOnInitBody = source.match(/async ngOnInit\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? ''

    expect(ngOnInitBody).not.toContain('loadEntryOnboardingEligibility')
  })

  it('keeps entry onboarding closed until it is explicitly requested', () => {
    const source = readSource()

    expect(source).toContain('readonly entryOnboardingOpen = signal(false)')
  })

  it('does not refresh entry onboarding DOM targets while onboarding is inactive', () => {
    const source = readSource()
    const scheduleRefreshBody = source.match(/private scheduleEntryOnboardingRefresh\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? ''
    const refreshStateBody = source.match(/private refreshEntryOnboardingState\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? ''

    expect(scheduleRefreshBody).toContain('if (!this.shouldTrackEntryOnboardingTargets())')
    expect(refreshStateBody).toContain('if (!this.shouldTrackEntryOnboardingTargets())')
  })
})
