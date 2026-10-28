import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import type { ArtifactPresentation, ArtifactPresentationQuery, ArtifactLibraryView } from '@xpert-ai/contracts'
import { map } from 'rxjs'
import { API_PREFIX } from '@cloud/app/@core/state'

@Injectable({ providedIn: 'root' })
export class ArtifactPresentationService {
  private readonly http = inject(HttpClient)
  read(slug: string) {
    return this.http.get<ArtifactPresentation>(this.url(slug))
  }
  readSnapshot(slug: string) {
    return this.http.get<ArtifactPresentation>(
      `${API_PREFIX}/artifacts/shared-links/${encodeURIComponent(slug)}/snapshot`
    )
  }
  query(slug: string, input: ArtifactPresentationQuery) {
    return this.http.post<object>(`${this.url(slug)}/query`, input)
  }
  readLibrary(id: string) {
    return this.http.get<ArtifactLibraryView>(`${API_PREFIX}/artifacts/library/${encodeURIComponent(id)}`)
  }
  readLibraryPresentation(id: string) {
    return this.readLibrary(id).pipe(
      map((view) => {
        if (view.content.kind !== 'presentation') throw new Error('Artifact presentation unavailable')
        return view.content.presentation
      })
    )
  }
  queryLibrary(id: string, input: ArtifactPresentationQuery) {
    return this.http.post<object>(`${API_PREFIX}/artifacts/library/${encodeURIComponent(id)}/query`, input)
  }
  readLibraryFile(id: string, revision: number) {
    return this.http.get(`${API_PREFIX}/artifacts/library/${encodeURIComponent(id)}/preview?revision=${revision}`, {
      responseType: 'blob'
    })
  }
  private url(slug: string) {
    return `${API_PREFIX}/artifacts/shared-links/${encodeURIComponent(slug)}/presentation`
  }
}
