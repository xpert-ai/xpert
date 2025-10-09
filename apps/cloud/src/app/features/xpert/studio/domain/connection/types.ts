export function removeConnSuffix(id: string) {
  return id ? removeSuffix(id, '/agent', '/knowledge', '/toolset', '/xpert', '/workflow', '/edge') : id
}

function removeSuffix(str: string, ...suffixs: string[]) {
  suffixs.forEach((suffix) => {
    if (str.endsWith(suffix)) {
      str = str.slice(0, -suffix.length)
    }
  })
  return str
}
