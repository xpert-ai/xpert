import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { TagService } from '../../../@core/services/tag.service'

@Component({
  standalone: true,
  selector: 'xp-tag-catalog-status',
  imports: [TranslateModule, ZardButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state()?.error) {
      <div class="flex flex-wrap items-center gap-2 text-sm text-text-secondary" role="status">
        <span>{{ 'XP.TagDirectory.LoadFailed' | translate: { Default: 'Unable to load tags.' } }}</span>
        <button z-button zType="ghost" type="button" (click)="tags.refresh()">
          {{ 'XP.TagDirectory.Retry' | translate: { Default: 'Retry' } }}
        </button>
      </div>
    }
  `
})
export class TagCatalogStatusComponent {
  readonly tags = inject(TagService)
  readonly state = toSignal(this.tags.getCatalogState())
}
