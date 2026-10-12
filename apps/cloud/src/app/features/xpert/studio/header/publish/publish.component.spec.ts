import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('XpertPublishVersionComponent layout', () => {
  const template = readFileSync(join(__dirname, 'publish.component.html'), 'utf8')

  it('keeps publish actions visible while the dialog body scrolls', () => {
    expect(template).toContain('max-h-[calc(100dvh-32px)]')
    const bodyStart = template.indexOf('<div xpDialogBody')
    const footerStart = template.indexOf('<footer xpDialogFooter')
    expect(bodyStart).toBeGreaterThan(0)
    expect(footerStart).toBeGreaterThan(bodyStart)
    expect(template.slice(footerStart)).toContain('(click)="publish()"')
    expect(template.slice(bodyStart, footerStart)).not.toContain('(click)="publish()"')
  })

  it('keeps marketplace information last and collapsed by default', () => {
    const marketplaceIndex = template.indexOf('data-marketplace-section')
    const versionHistoryIndex = template.indexOf('XP.Xpert.VersionHistory')
    const publishBindingIndex = template.indexOf('XP.Xpert.PublishBinding')
    const businessAreaIndex = template.indexOf('data-business-area-section')

    expect(marketplaceIndex).toBeGreaterThan(versionHistoryIndex)
    expect(marketplaceIndex).toBeGreaterThan(publishBindingIndex)
    expect(businessAreaIndex).toBeGreaterThan(versionHistoryIndex)
    expect(marketplaceIndex).toBeGreaterThan(businessAreaIndex)
    expect(template.slice(marketplaceIndex, marketplaceIndex + 240)).toContain('<z-accordion-item')
    expect(template.slice(marketplaceIndex, marketplaceIndex + 240)).not.toContain('expanded')
  })

  it('offers an optional business area selector without a redundant menu preview', () => {
    const businessAreaSection = template.slice(
      template.indexOf('data-business-area-section'),
      template.indexOf('data-marketplace-section')
    )

    expect(businessAreaSection).toContain('[(ngModel)]="businessAreaId"')
    expect(businessAreaSection).toContain('[selectOptions]="businessAreaOptions()"')
    expect(businessAreaSection).not.toContain('MenuPreview')
  })
})
