import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, effect, inject, input, output } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router } from '@angular/router'
import { NgmHighlightDirective } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { DateRelativePipe, injectHelpWebsite, IXpert, XpertTypeEnum } from '../../../@core'
import { EmojiAvatarComponent } from '../../avatar'
import { UserPipe } from '../../pipes'
import { TagComponent } from '../../tag'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    CdkMenuModule,
    MatTooltipModule,
    NgmHighlightDirective,
    EmojiAvatarComponent,
    TagComponent,
    UserPipe,
    DateRelativePipe
  ],
  selector: 'xpert-card',
  templateUrl: 'xpert-card.component.html',
  styleUrls: ['xpert-card.component.scss']
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
