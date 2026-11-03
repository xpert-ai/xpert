import assert from 'node:assert/strict'
import { expect } from '@playwright/test'

/** Verify the rendered indicator and divider together, including overflow ancestors. */
export async function assertAttachedTabIndicator(tab) {
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => tab.evaluate((element) => getComputedStyle(element, '::after').opacity)).toBe('1')
  const geometry = await tab.evaluate((element) => {
    const header = element.closest('[data-slot="tabs-header"]')
    if (!header) throw new Error('Attached tab header is missing')
    const trigger = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const indicator = getComputedStyle(element, '::after')
    const headerStyle = getComputedStyle(header)
    const divider = header.getBoundingClientRect().bottom - parseFloat(headerStyle.borderBottomWidth)
    const bottom = trigger.bottom - parseFloat(style.borderBottomWidth) - parseFloat(indicator.bottom)
    const top = bottom - parseFloat(indicator.height)
    const left = trigger.left + parseFloat(style.borderLeftWidth) + parseFloat(indicator.left)
    const right = left + parseFloat(indicator.width)
    const clippedBy = []
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const bounds = ancestor.getBoundingClientRect()
      const overflow = getComputedStyle(ancestor)
      const clips = (value) => ['auto', 'scroll', 'hidden', 'clip'].includes(value)
      if (
        (clips(overflow.overflowY) && (top < bounds.top - 0.1 || bottom > bounds.bottom + 0.1)) ||
        (clips(overflow.overflowX) && (left < bounds.left - 0.1 || right > bounds.right + 0.1))
      )
        clippedBy.push(ancestor.getAttribute('data-slot') ?? ancestor.tagName)
    }
    return {
      gap: divider - bottom,
      height: bottom - top,
      width: right - left,
      background: indicator.backgroundColor,
      content: indicator.content,
      clippedBy
    }
  })
  assert.ok(Math.abs(geometry.gap) < 0.1, `Tab indicator must meet the divider: ${JSON.stringify(geometry)}`)
  assert.ok(geometry.height > 0 && geometry.width > 0)
  assert.notEqual(geometry.background, 'rgba(0, 0, 0, 0)')
  assert.notEqual(geometry.content, 'none')
  assert.deepEqual(geometry.clippedBy, [], 'Tab indicator must not be clipped')
}
