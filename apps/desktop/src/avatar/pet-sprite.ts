export type PetSpriteVersion = 1 | 2

/** Detect the standard layout, never infer a version from a filename or pet ID. */
export function petSpriteVersion(width: number, height: number): PetSpriteVersion | undefined {
  if (width !== 1536) return
  if (height === 1872) return 1
  if (height === 2288) return 2
}

export function validatePetSprite(width: number, height: number, declared?: PetSpriteVersion): PetSpriteVersion {
  const version = petSpriteVersion(width, height)
  if (!version) throw new Error('Use a 1536 × 1872 (v1) or 1536 × 2288 (v2) sprite sheet.')
  if (declared !== undefined && version !== declared)
    throw new Error('The sprite sheet dimensions do not match the version in pet.json.')
  return version
}

/** 16 directions clockwise from up. The centre dead zone returns to the idle animation. */
export function petLookFrame(dx: number, dy: number, deadZone = 12) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) <= deadZone) return null
  const index = (Math.round(Math.atan2(dx, -dy) / (Math.PI / 8)) + 16) % 16
  return { row: 9 + Math.floor(index / 8), column: index % 8 }
}
