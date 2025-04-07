import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, input, output } from '@angular/core'
import { injectHelpWebsite, IXpert, XpertTypeEnum } from '../../../@core'
import { EmojiAvatarComponent } from '../../avatar'
import { UserPipe } from '../../pipes'
import { TagComponent } from '../../tag'
import { TranslateModule } from '@ngx-translate/core'
import { CdkMenuModule } from '@angular/cdk/menu'
import { NgmHighlightDirective } from '@metad/ocap-angular/common'

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

  // Inputs
  readonly xpert = input<IXpert>()
  readonly inline = input<boolean, boolean | string>(false, {
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
}
