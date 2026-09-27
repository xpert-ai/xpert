// Mint only version-pinned image previews; account credentials stay in the host.
module.exports.createArtifactMethods = function createArtifactMethods(ClientError) {
  const validId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,256}$/.test(value)

  return {
    async toolOutputPreview(attachment) {
      if (!this.credentials) throw new ClientError('Please sign in first.', 401)
      if (!this.profile?.organizationId) throw new ClientError('You cannot access this workspace.', 403)
      if (
        !validId(attachment?.artifactId) ||
        !validId(attachment?.artifactVersionId) ||
        typeof attachment.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/i.test(attachment.sha256) ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(attachment.mimeType)
      ) {
        throw new ClientError('Invalid tool output attachment.')
      }
      const link = await this.request(
        `/api/artifacts/${encodeURIComponent(attachment.artifactId)}/links/signed-preview`,
        {
          method: 'POST',
          scope: 'organization',
          body: {
            artifactVersionId: attachment.artifactVersionId,
            versionMode: 'version',
            ttlSeconds: 300,
            presentation: { disposition: 'inline', allowDownload: false }
          }
        }
      )
      if (
        link?.artifactId !== attachment.artifactId ||
        link.version?.id !== attachment.artifactVersionId ||
        typeof link.version?.sha256 !== 'string' ||
        link.version.sha256.toLowerCase() !== attachment.sha256.toLowerCase() ||
        link.version.mimeType !== attachment.mimeType
      ) {
        throw new ClientError('The image preview does not match the requested attachment.', 502)
      }
      let url
      try {
        url = new URL(link.publicUrl)
      } catch {
        throw new ClientError('The service returned an invalid image preview.', 502)
      }
      const expiresAt = typeof link.expiresAt === 'string' ? Date.parse(link.expiresAt) : NaN
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= Date.now()
      ) {
        throw new ClientError('The service returned an invalid image preview.', 502)
      }
      return { previewUrl: url.href, expiresAt: new Date(expiresAt).toISOString() }
    }
  }
}
