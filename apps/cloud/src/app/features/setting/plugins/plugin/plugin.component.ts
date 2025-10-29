import { CommonModule } from '@angular/common'
import { Component, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { injectHelpWebsite, routeAnimations } from '@cloud/app/@core'
import { IconComponent } from '@cloud/app/@shared/avatar'
import { OverlayAnimations } from '@metad/core'
import { NgmHighlightDirective } from '@metad/ocap-angular/common'
import { NgmTooltipDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { TPlugin } from '../types'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    FormsModule,
    NgmHighlightDirective,
    IconComponent,
  ],
  selector: 'xp-settings-plugin',
  templateUrl: './plugin.component.html',
  styleUrls: ['./plugin.component.scss'],
  animations: [routeAnimations, ...OverlayAnimations]
})
export class PluginComponent {

  readonly installHelpUrl = injectHelpWebsite('/docs/plugin/install')
  
  readonly plugin = input<TPlugin>()
}
