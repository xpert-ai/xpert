import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { API_PREFIX } from '@xpert-ai/cloud/state'

export type SignedArtifactPreviewLink = {
  id: string
  artifactId: string
  publicUrl: string
  expiresAt?: string | Date | null
  version?: {
    mimeType?: string | null
    fileName?: string | null
    title?: string | null
    size?: number | null
  } | null
  artifact?: {
    title?: string | null
    currentVersion?: {
      mimeType?: string | null
      fileName?: string | null
      title?: string | null
      size?: number | null
    } | null
  } | null
}

@Injectable({ providedIn: 'root' })
export class ArtifactService {
  readonly #http = inject(HttpClient)

  createSignedPreviewLink(artifactId: string, ttlSeconds = 300) {
    return this.#http.post<SignedArtifactPreviewLink>(
      `${API_PREFIX}/artifacts/${encodeURIComponent(artifactId)}/links/signed-preview`,
      {
        versionMode: 'latest',
        ttlSeconds,
        presentation: {
          disposition: 'inline',
          allowDownload: true
        }
      }
    )
  }
}
