import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, input } from '@angular/core'
import { NgmHighlightDirective } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { injectHelpWebsite, IXpertToolset, XpertToolsetCategoryEnum } from '../../../@core'
import { EmojiAvatarComponent } from '../../avatar'
import { UserPipe } from '../../pipes'
import { TagComponent } from '../../tag'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    NgmHighlightDirective,
    EmojiAvatarComponent,
    NgmI18nPipe,
    TagComponent,
    UserPipe
  ],
  selector: 'xpert-toolset-card',
  templateUrl: 'toolset.component.html',
  styleUrls: ['toolset.component.scss']
})
export class ToolsetCardComponent {
  eXpertToolsetCategoryEnum = XpertToolsetCategoryEnum
  
  readonly helpWebsite = injectHelpWebsite()

  readonly toolset = input<IXpertToolset>()
  readonly inline = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly highlight = input<string>()
  readonly editable = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  readonly tags = computed(() => this.toolset()?.tags)
  readonly tagsTitle = computed(() =>
    this.tags()
      ?.map((t) => t.name)
      .join(',')
  )
}
