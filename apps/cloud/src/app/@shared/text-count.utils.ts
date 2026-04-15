const DISPLAY_TEXT_UNIT_PATTERN =
  /\p{Script=Han}|[\p{Script=Latin}\p{Number}]+(?:['’_-][\p{Script=Latin}\p{Number}]+)*/gu

export function countDisplayTextUnits(value?: string | null) {
  const content = value?.trim()
  if (!content) {
    return 0
  }

  return content.match(DISPLAY_TEXT_UNIT_PATTERN)?.length ?? 0
}
