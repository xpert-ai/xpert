import { Component, effect, inject } from '@angular/core'
import { Meta } from '@angular/platform-browser'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute } from '@angular/router'
import { map } from 'rxjs'
import { ArtifactPresentationComponent } from './artifact-presentation.component'

@Component({
  standalone: true,
  host: { class: 'block h-dvh w-full min-w-0 flex-1' },
  imports: [ArtifactPresentationComponent],
  template: `<main class="h-dvh w-full bg-components-card-bg text-text-primary">
    <xp-artifact-presentation [slug]="slug()" [snapshot]="snapshot()" />
  </main>`
})
export class ArtifactSharePageComponent {
  private readonly meta = inject(Meta)
  constructor() {
    effect((onCleanup) => {
      if (!this.snapshot()) return
      const previous = ['robots', 'referrer'].map((name) => ({
        name,
        content: this.meta.getTag(`name="${name}"`)?.content
      }))
      this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow, noarchive' })
      this.meta.updateTag({ name: 'referrer', content: 'no-referrer' })
      onCleanup(() => {
        for (const tag of previous) {
          if (tag.content) this.meta.updateTag({ name: tag.name, content: tag.content })
          else this.meta.removeTag(`name="${tag.name}"`)
        }
      })
    })
  }
  readonly snapshot = toSignal(inject(ActivatedRoute).data.pipe(map((data) => data['snapshot'] === true)), {
    initialValue: false
  })
  readonly slug = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('artifactLinkSlug') ?? '')),
    { initialValue: '' }
  )
}
