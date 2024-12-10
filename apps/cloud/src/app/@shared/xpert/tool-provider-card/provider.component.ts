import { CommonModule } from '@angular/common'
import { Component, computed, input, output } from '@angular/core'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { upperFirst } from 'lodash-es'
import { injectHelpWebsite, ITag, IToolProvider, TagCategoryEnum } from '../../../@core'
import { EmojiAvatarComponent } from '../../avatar'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, EmojiAvatarComponent, NgmI18nPipe],
  selector: 'xpert-tool-provider-card',
  templateUrl: 'provider.component.html',
  styleUrls: ['provider.component.scss']
})
export class ToolProviderCardComponent {
  readonly helpWebsite = injectHelpWebsite()

  // Inputs
  readonly provider = input<IToolProvider>()
  readonly builtinTags = input<ITag[]>()

  // States
  readonly tags = computed(() => {
    return this.provider()?.tags?.map((tag) => 
      this.builtinTags()?.find((_) => _.name === tag) ?? {id: TagCategoryEnum.TOOLSET + '/' + tag, name: tag, description: upperFirst(tag)}
    )
  })

  readonly title = input<string>(null)
  readonly description = input<string>(null)
  readonly helpUrl = input<string>(null)
  readonly helpTitle = input<string>(null)

  readonly create = output()

  onCreate() {
    this.create.emit()
  }
}
