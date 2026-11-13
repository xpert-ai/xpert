// Matches the multipart limit on POST /agent-plugins/zip.
export const MAX_PLUGIN_ZIP_BYTES = 100 * 1024 * 1024

export function pluginZipError(name, size) {
  if (!/\.zip$/i.test(name) || !size) return 'Choose a non-empty ZIP plugin package.'
  if (size > MAX_PLUGIN_ZIP_BYTES) return 'The ZIP package exceeds the 100 MiB limit.'
  return null
}
