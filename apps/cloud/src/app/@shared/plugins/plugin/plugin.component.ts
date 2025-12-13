import { CommonModule } from '@angular/common'
import { Component, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { I18nObject, IconDefinition, injectHelpWebsite } from '@cloud/app/@core'
import { IconComponent } from '@cloud/app/@shared/avatar'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'

export type TPlugin = {
  name: string
  displayName: I18nObject
  description: I18nObject
  version: string
  category: string
  icon: IconDefinition
  author: {
    name: string
    url: string
  }
  source?: {
    url: string
    type: 'marketplace' | 'github' | 'npm' | 'website' | 'other'
  }
  keywords?: string[]
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    FormsModule,
    NgmI18nPipe,
    IconComponent,
  ],
  selector: 'xp-plugin',
  templateUrl: './plugin.component.html',
  styleUrls: ['./plugin.component.scss'],
  animations: []
})
export class PluginComponent {

  readonly installHelpUrl = injectHelpWebsite('/docs/plugin/install')
  
  // Inputs
  readonly plugin = input<TPlugin>()
  readonly installed = input<boolean>(false)

}
