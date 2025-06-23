/**
 * Replaces all whitespace characters in a string with a specified target character.
 */
export function replaceWhitespaceChar(value: string, target = '_') {
  return value.replace(/\s+/g, '_')
}

/**
 * Validates if a given string is a valid tool name (alphanumeric, underscores, and hyphens allowed).
 */
export function validateToolName(name: string) {
  return /^[a-zA-Z0-9_-]+$/.test(name)
}

export function urlJoin(...parts: string[]) {
  return parts
    .map((part, index) => {
      if (typeof part !== 'string') {
        throw new TypeError(`Expected string but got ${typeof part}`);
      }
      // Remove the head and tail /
      if (index === 0) {
        return part.replace(/\/+$/, '');
      } else {
        return part.replace(/^\/+|\/+$/g, '');
      }
    })
    .filter(Boolean)
    .join('/')
}
