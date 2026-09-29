export interface AvatarPointer {
  x: number
  y: number
}

export interface AvatarGaze {
  x: number
  y: number
  proximity: number
}

export const restingGaze: AvatarGaze = { x: 0, y: 0, proximity: 0 }

export function avatarGaze(
  pointer: AvatarPointer | null,
  bounds: { left: number; top: number; width: number; height: number }
): AvatarGaze {
  if (!pointer || bounds.width <= 0 || bounds.height <= 0) return { ...restingGaze }
  const dx = pointer.x - bounds.left - bounds.width / 2
  const dy = pointer.y - bounds.top - bounds.height / 2
  // Reach a clear turn within a few avatar widths, rather than barely moving on a wide window.
  const reach = Math.max(80, bounds.width * 1.5)
  const distance = Math.hypot(dx, dy)
  return {
    x: Math.tanh(dx / reach),
    y: Math.tanh(dy / reach),
    proximity: 1 / (1 + (distance / reach) ** 2)
  }
}

export function easeGaze(current: AvatarGaze, target: AvatarGaze, elapsed: number): AvatarGaze {
  const blend = 1 - Math.exp(-Math.min(64, Math.max(0, elapsed)) / 75)
  const next = { ...current }
  for (const key of ['x', 'y', 'proximity'] as const) {
    next[key] += (target[key] - current[key]) * blend
    if (Math.abs(target[key] - next[key]) < 0.001) next[key] = target[key]
  }
  return next
}

export function gazeTransforms(gaze: AvatarGaze) {
  const n = (value: number) => value.toFixed(3)
  const eye = (center: number, side: number) => {
    // The eye on the gaze side recedes; the opposite eye becomes larger.
    const scale = 1 + gaze.proximity * 0.12 - side * gaze.x * 0.36
    return `translate(${n(gaze.x * 14)} ${n(gaze.y * 12)}) translate(${center} 46) scale(${n(scale)} ${n(scale * (1 - Math.abs(gaze.y) * 0.16))}) translate(${-center} -46)`
  }
  return {
    left: eye(31, -1),
    right: eye(71, 1),
    mouth: `translate(${n(gaze.x * 10)} ${n(gaze.y * 9)}) translate(50 72) rotate(${n(gaze.x * 10)}) scale(${n(1 + gaze.proximity * 0.1 - Math.abs(gaze.x) * 0.1)} ${n(1 + gaze.y * 0.14)}) translate(-50 -72)`
  }
}
