import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ISkillMarketFeaturedSkill, ISkillRepositoryIndex } from '@cloud/app/@core'
import {
  skillDisplayDescription,
  skillDisplayTitle,
  skillPublisherAvatarFallback,
  skillPublisherDisplayName,
  skillPublisherHandle
} from '../skill.utils'

type ExploreSkillDetailDialogData = {
  item: ISkillRepositoryIndex
  featured?: ISkillMarketFeaturedSkill | null
  defaultWorkspaceName?: string | null
}

@Component({
  standalone: true,
  selector: 'xp-explore-skill-detail-dialog',
  imports: [CommonModule, TranslateModule],
  templateUrl: './detail-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block w-full max-w-3xl rounded-[28px] bg-components-panel-bg shadow-xl'
  }
})
export class ExploreSkillDetailDialogComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly #data = inject<ExploreSkillDetailDialogData>(DIALOG_DATA)
  readonly #compactNumber = new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1
  })

  readonly item = this.#data.item
  readonly featured = this.#data.featured ?? null
  readonly defaultWorkspaceName = this.#data.defaultWorkspaceName ?? null

  readonly title = computed(() => skillDisplayTitle(this.item, this.featured))
  readonly description = computed(() => skillDisplayDescription(this.item, this.featured))
  readonly publisherName = computed(() => skillPublisherDisplayName(this.item))
  readonly publisherHandle = computed(() => skillPublisherHandle(this.item))
  readonly publisherAvatarFallback = computed(() => skillPublisherAvatarFallback(this.item))

  close() {
    this.#dialogRef.close()
  }

  install() {
    this.#dialogRef.close('install')
  }

  formatStat(value?: number | null): string {
    return typeof value === 'number' && Number.isFinite(value) ? this.#compactNumber.format(value) : '--'
  }
}
