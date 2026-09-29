const { createHash } = require('node:crypto')

// Resolve version-pinned previews; account credentials stay in the host.
module.exports.createArtifactMethods = function createArtifactMethods(ClientError) {
  const validId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,256}$/.test(value)

  return {
    async deliveredFilePreview(attachment) {
      if (!this.credentials) throw new ClientError('Please sign in first.', 401)
      if (!this.profile?.organizationId) throw new ClientError('You cannot access this workspace.', 403)
      if (!validId(attachment?.artifactId) || !validId(attachment?.artifactVersionId))
        throw new ClientError('Invalid file delivery.')
      const generation = this.generation
      const link = await this.request(
        `/api/artifacts/${encodeURIComponent(attachment.artifactId)}/links/signed-preview`,
        {
          method: 'POST',
          scope: 'organization',
          body: {
            artifactVersionId: attachment.artifactVersionId,
            versionMode: 'version',
            ttlSeconds: 300,
            presentation: { disposition: 'inline', allowDownload: true }
          }
        }
      )
      const version = link?.version
      let url
      try {
        url = new URL(link.publicUrl)
      } catch {
        throw new ClientError('Invalid file preview.', 502)
      }
      if (
        link.artifactId !== attachment.artifactId ||
        version?.id !== attachment.artifactVersionId ||
        !/^[a-f0-9]{64}$/i.test(version?.sha256 || '') ||
        typeof version?.mimeType !== 'string' ||
        !Number.isSafeInteger(version?.size) ||
        version.size < 1 ||
        version.size > 64 * 1024 * 1024 ||
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        !(Date.parse(link.expiresAt) > Date.now())
      )
        throw new ClientError('Invalid file preview.', 502)
      // Keep file fetching in the host: the renderer deliberately cannot make arbitrary network requests.
      // The URL comes from the authenticated signing endpoint, never from the renderer.
      let bytes
      try {
        const response = await this.fetcher(url.href, {
          redirect: 'error',
          credentials: 'omit',
          signal: AbortSignal.timeout(20000)
        })
        if (!response.ok || !response.body) throw new Error('unavailable')
        const reader = response.body.getReader()
        const chunks = []
        let size = 0
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > version.size) {
            await reader.cancel()
            throw new Error('size mismatch')
          }
          chunks.push(Buffer.from(value))
        }
        bytes = Buffer.concat(chunks)
        if (size !== version.size || createHash('sha256').update(bytes).digest('hex') !== version.sha256.toLowerCase())
          throw new Error('content mismatch')
      } catch {
        throw new ClientError('Could not load the delivered file.', 502)
      }
      if (generation !== this.generation) throw new ClientError('The session changed. Please retry.', 409)
      return {
        base64: bytes.toString('base64'),
        sha256: version.sha256,
        size: version.size,
        mimeType: version.mimeType,
        name: version.fileName || version.title || 'download'
      }
    },
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
