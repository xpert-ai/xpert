import { z } from 'zod/v3'
import { iconDefinitionSchema } from './icon-definition.schema'
import type { IconDefinition } from './types'

describe('shared icon metadata', () => {
  it('keeps required output fields and object-schema composition', () => {
    const icon: IconDefinition = iconDefinitionSchema.parse({ type: 'emoji', value: '📊' })
    expect(icon).toEqual({ type: 'emoji', value: '📊' })
    expect(iconDefinitionSchema.extend({ label: z.string() }).parse({ ...icon, label: 'Chart' })).toEqual({
      ...icon,
      label: 'Chart'
    })
  })
  it.each([
    {},
    { type: 'svg' },
    { type: 'svg', value: '' },
    { type: 'script', value: 'invalid' },
    { type: 'emoji', value: '📊', size: -1 }
  ])('rejects malformed metadata %#', (value) => {
    expect(iconDefinitionSchema.safeParse(value).success).toBe(false)
  })
})
