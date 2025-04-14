import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, inject, input, output } from '@angular/core'
import { injectHelpWebsite, IXpert, XpertTypeEnum } from '../../../@core'
import { EmojiAvatarComponent } from '../../avatar'
import { UserPipe } from '../../pipes'
import { TagComponent } from '../../tag'
import { TranslateModule } from '@ngx-translate/core'
import { CdkMenuModule } from '@angular/cdk/menu'
import { NgmHighlightDirective } from '@metad/ocap-angular/common'
import { Router } from '@angular/router'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, CdkMenuModule, NgmHighlightDirective, EmojiAvatarComponent, TagComponent, UserPipe],
  selector: 'xpert-card',
  templateUrl: 'xpert-card.component.html',
  styleUrls: ['xpert-card.component.scss'],
})
export class XpertCardComponent {
  eXpertTypeEnum = XpertTypeEnum

  readonly helpWebsite = injectHelpWebsite()
  readonly #router = inject(Router)

  // Inputs
  readonly xpert = input<IXpert>()
  readonly inline = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly editable = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })
  readonly highlight = input<string>()

  // Outputs
  readonly delete = output<string>()

  readonly tags = computed(() => this.xpert()?.tags)
  readonly tagsTitle = computed(() =>
    this.tags()
      ?.map((t) => t.name)
      .join(',')
  )

  edit() {
    this.#router.navigate(['/xpert', this.xpert().id])
  }
}
