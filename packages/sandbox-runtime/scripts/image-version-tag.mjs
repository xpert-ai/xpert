// Invariants: published source tags and platform aliases use the same family rule.
// Unknown families and missing versions must fail before any image is published.
export function imageVersionTag(image, suiteVersion) {
  let field
  let prefix
  switch (image.imageFamily) {
    case 'browser':
    case 'browser-video':
    case 'browser-ai':
      field = 'playwrightVersion'
      prefix = 'pw'
      break
    case 'document':
      field = 'libreOfficeMajorVersion'
      prefix = 'lo'
      break
    case 'document-python':
      field = 'pythonVersion'
      prefix = 'py'
      break
    default:
      throw new Error(`Unsupported Runtime image family: ${image.imageFamily}`)
  }
  const version = image[field]
  if (typeof version !== 'string' || !/^\d+(?:\.\d+)*$/.test(version)) {
    throw new Error(`${image.imageFamily} requires a valid ${field} for its image tag.`)
  }
  return `${suiteVersion}-${prefix}${version}`
}
