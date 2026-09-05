import { createRuntimeCapability, DefaultRuntimeCapabilityRegistry } from './runtime-capability'

describe('DefaultRuntimeCapabilityRegistry', () => {
  const capability = createRuntimeCapability<{ source: string }>('test.capability')

  it('resolves capabilities inherited from a parent registry', () => {
    const parent = new DefaultRuntimeCapabilityRegistry().register(capability, { source: 'platform' })
    const scoped = new DefaultRuntimeCapabilityRegistry([], parent)

    expect(scoped.has(capability)).toBe(true)
    expect(scoped.require(capability)).toEqual({ source: 'platform' })
  })

  it('lets a scoped capability override its parent', () => {
    const parent = new DefaultRuntimeCapabilityRegistry().register(capability, { source: 'platform' })
    const scoped = new DefaultRuntimeCapabilityRegistry([[capability, { source: 'scope' }]], parent)

    expect(scoped.require(capability)).toEqual({ source: 'scope' })
  })
})
