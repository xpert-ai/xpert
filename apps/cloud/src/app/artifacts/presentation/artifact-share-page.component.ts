import { Component, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute } from '@angular/router'
import { map } from 'rxjs'
import { ArtifactPresentationComponent } from './artifact-presentation.component'

@Component({
  standalone: true,
  host: { class: 'block h-dvh w-full min-w-0 flex-1' },
  imports: [ArtifactPresentationComponent],
  template: `<main class="h-dvh w-full bg-components-card-bg text-text-primary">
    <xp-artifact-presentation [slug]="slug()" />
  </main>`
})
export class ArtifactSharePageComponent {
  readonly slug = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('artifactLinkSlug') ?? '')),
    { initialValue: '' }
  )
}
