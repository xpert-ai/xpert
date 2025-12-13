import { CommonModule } from '@angular/common'
import { Component, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { injectHelpWebsite, routeAnimations } from '@cloud/app/@core'
import { OverlayAnimations } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { TPluginWithDownloads } from '../types'
import { Dialog } from '@angular/cdk/dialog'
import { PluginInstallComponent } from '../install/install.component'
import { PluginComponent } from '@cloud/app/@shared/plugins'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    FormsModule,
    PluginComponent
  ],
  selector: 'xp-settings-plugin',
  templateUrl: './plugin.component.html',
  styleUrls: ['./plugin.component.scss'],
  animations: [routeAnimations, ...OverlayAnimations]
})
export class SettingsPluginComponent {

  readonly #dialog = inject(Dialog)
  readonly installHelpUrl = injectHelpWebsite('/docs/plugin/install')
  
  readonly plugin = input<TPluginWithDownloads>()

  install() {
    this.#dialog.open(PluginInstallComponent, {
      data: this.plugin(),
      disableClose: true,
    }).closed.subscribe({
      next: (result) => {
        console.log('The dialog was closed', result)
      }
    })
  }
}
