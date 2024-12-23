export function replaceWhitespaceChar(value: string, target = '_') {
  return value.replace(/\s+/g, '_') // 替换空格为 _
}

export function validateToolName(name: string) {
  return /^[a-zA-Z0-9_-]+$/.test(name)
}