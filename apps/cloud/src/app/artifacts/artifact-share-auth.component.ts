import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { ARTIFACT_SHARE_SESSION_HTTP_OPTIONS, artifactShareSessionUrl } from './artifact-share-session'

@Component({
  standalone: true,
  selector: 'pac-artifact-share-auth',
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="flex h-dvh w-full items-center justify-center bg-components-card-bg text-text-primary">
      @if (error()) {
        <section class="mx-auto max-w-lg px-6 text-center">
          <h1 class="text-xl font-semibold">
            {{ 'ArtifactShareAuth.Unavailable' | translate: { Default: 'This shared artifact is unavailable' } }}
          </h1>
          <p class="mt-2 text-sm text-text-secondary">
            {{
              'ArtifactShareAuth.UnavailableHint'
                | translate: { Default: 'The link may have expired, been revoked, or you may not have access.' }
            }}
          </p>
        </section>
      } @else {
        <div class="flex items-center gap-3 text-sm text-text-secondary" role="status">
          <span class="size-5 animate-spin rounded-full border-2 border-current border-r-transparent"></span>
          <span>{{ 'ArtifactShareAuth.Authorizing' | translate: { Default: 'Checking access…' } }}</span>
        </div>
      }
    </main>
  `
})
export class ArtifactShareAuthComponent implements OnInit {
  private readonly http = inject(HttpClient)
  private readonly route = inject(ActivatedRoute)

  readonly error = signal(false)

  ngOnInit() {
    void this.authorize()
  }

  private async authorize() {
    const slug = this.route.snapshot.paramMap.get('artifactLinkSlug')?.trim()
    if (!slug) {
      this.error.set(true)
      return
    }
    try {
      const session = await firstValueFrom(
        this.http.post<{ publicUrl: string }>(artifactShareSessionUrl(slug), {}, ARTIFACT_SHARE_SESSION_HTTP_OPTIONS)
      )
      const target =
        this.route.snapshot.queryParamMap.get('download') === '1'
          ? appendDownloadPath(session.publicUrl)
          : session.publicUrl
      window.location.replace(target)
    } catch {
      this.error.set(true)
    }
  }
}

function appendDownloadPath(publicUrl: string) {
  const url = new URL(publicUrl, window.location.origin)
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/download`
  return url.toString()
}
