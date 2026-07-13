import type { WorkbenchOpenFileEvidenceBox } from '@xpert-ai/contracts'

export type PdfEvidenceRotation = 0 | 90 | 180 | 270

export function normalizePdfEvidenceRotation(value: number | null | undefined): PdfEvidenceRotation {
  if (!Number.isFinite(value)) {
    return 0
  }

  const normalized = ((Math.round(Number(value)) % 360) + 360) % 360
  return normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0
}

/**
 * PDF.js already applies the rotation embedded in the PDF page. Recognition
 * rotation is relative to that rendered orientation, so the preview viewport
 * must compose both clockwise rotations.
 */
export function resolvePdfEvidenceViewportRotation(
  pageRotation: number | null | undefined,
  recognitionRotation: number | null | undefined
): PdfEvidenceRotation {
  return normalizePdfEvidenceRotation(Number(pageRotation ?? 0) + Number(recognitionRotation ?? 0))
}

/**
 * Rotate a normalized, top-left-origin evidence box clockwise with its page.
 * The result remains normalized to the rotated page dimensions.
 */
export function rotateNormalizedEvidenceBox(
  box: WorkbenchOpenFileEvidenceBox,
  rotation: PdfEvidenceRotation
): WorkbenchOpenFileEvidenceBox {
  switch (rotation) {
    case 90:
      return {
        x: 1 - box.y - box.height,
        y: box.x,
        width: box.height,
        height: box.width
      }
    case 180:
      return {
        x: 1 - box.x - box.width,
        y: 1 - box.y - box.height,
        width: box.width,
        height: box.height
      }
    case 270:
      return {
        x: box.y,
        y: 1 - box.x - box.width,
        width: box.height,
        height: box.width
      }
    default:
      return { ...box }
  }
}
