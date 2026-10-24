import { projectPipelineResourceReservationSchema } from './resources.schema'

describe('durable resource reservation boundary', () => {
  const claim = { key: 'a'.repeat(64), mode: 'exclusive' }
  it('canonicalizes a bounded claim set without accepting caller paths or permissions', () => {
    const parsed = projectPipelineResourceReservationSchema.parse({
      resolverRef: 'neutral.resources@1',
      claims: [{ key: 'b'.repeat(64), mode: 'shared' }, claim]
    })
    expect(parsed.claims[0]).toEqual(claim)
    for (const claims of [
      [],
      [claim, claim],
      [{ ...claim, path: '/tmp' }],
      [{ ...claim, key: '../tmp' }],
      [{ ...claim, mode: 'write' }],
      Array.from({ length: 33 }, (_, i) => ({ key: i.toString(16).padStart(64, '0'), mode: 'shared' }))
    ]) {
      expect(
        projectPipelineResourceReservationSchema.safeParse({ resolverRef: 'neutral.resources@1', claims }).success
      ).toBe(false)
    }
  })
})
