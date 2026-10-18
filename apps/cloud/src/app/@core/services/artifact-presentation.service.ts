import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import type { ArtifactPresentation, ArtifactPresentationQuery } from '@xpert-ai/contracts'
import { API_PREFIX } from '@cloud/app/@core/state'

@Injectable({ providedIn: 'root' })
export class ArtifactPresentationService {
  private readonly http = inject(HttpClient)
  read(slug: string) {
    return this.http.get<ArtifactPresentation>(this.url(slug))
  }
  query(slug: string, input: ArtifactPresentationQuery) {
    return this.http.post<object>(`${this.url(slug)}/query`, input)
  }
  private url(slug: string) {
    return `${API_PREFIX}/artifacts/shared-links/${encodeURIComponent(slug)}/presentation`
  }
}
