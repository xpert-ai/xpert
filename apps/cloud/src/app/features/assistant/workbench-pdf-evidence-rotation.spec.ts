import {
  normalizePdfEvidenceRotation,
  resolvePdfEvidenceViewportRotation,
  rotateNormalizedEvidenceBox
} from './workbench-pdf-evidence-rotation'

describe('PDF evidence rotation', () => {
  const box = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }

  it.each([
    [0, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }],
    [90, { x: 0.4, y: 0.1, width: 0.4, height: 0.3 }],
    [180, { x: 0.6, y: 0.4, width: 0.3, height: 0.4 }],
    [270, { x: 0.2, y: 0.6, width: 0.4, height: 0.3 }]
  ] as const)('rotates a top-left normalized box clockwise by %s degrees', (rotation, expected) => {
    const result = rotateNormalizedEvidenceBox(box, rotation)
    expect(result.x).toBeCloseTo(expected.x)
    expect(result.y).toBeCloseTo(expected.y)
    expect(result.width).toBeCloseTo(expected.width)
    expect(result.height).toBeCloseTo(expected.height)
  })

  it.each([
    [undefined, 0],
    [null, 0],
    [Number.NaN, 0],
    [45, 0],
    [-90, 270],
    [450, 90]
  ] as const)('normalizes %s to a supported PDF rotation', (value, expected) => {
    expect(normalizePdfEvidenceRotation(value)).toBe(expected)
  })

  it.each([
    [0, 90, 90],
    [90, 90, 180],
    [270, 90, 0],
    [90, 270, 0]
  ] as const)(
    'composes PDF page rotation %s with recognition rotation %s as %s degrees',
    (pageRotation, recognitionRotation, expected) => {
      expect(resolvePdfEvidenceViewportRotation(pageRotation, recognitionRotation)).toBe(expected)
    }
  )
})
