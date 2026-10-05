function allowVoicePermission({ contents, mainContents, permission, source, rendererUrl, details, check = false }) {
  if (!mainContents || contents !== mainContents || permission !== 'media') return false
  if (mainContents.getURL() !== rendererUrl) return false
  if (check) {
    const expectedOrigin = new URL(rendererUrl).origin
    return (
      (source === expectedOrigin || (expectedOrigin === 'null' && source === 'file://')) &&
      details?.requestingUrl === rendererUrl &&
      details?.mediaType === 'audio' &&
      details?.isMainFrame === true
    )
  }
  return (
    source === rendererUrl &&
    details?.isMainFrame === true &&
    Array.isArray(details.mediaTypes) &&
    details.mediaTypes.length > 0 &&
    details.mediaTypes.every((type) => type === 'audio')
  )
}
module.exports = { allowVoicePermission }
