import { Dialog, DialogModule, DialogRef } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit, ViewContainerRef } from '@angular/core'
import { Router } from '@angular/router'
import { AssistantSettingsComponent } from '../../setting/assistant/assistant-settings.component'

@Component({
  selector: 'xp-clawxpert-assistant-settings',
  standalone: true,
  imports: [DialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  host: { class: 'block h-full' }
})
export class ClawXpertAssistantSettingsComponent implements OnInit, OnDestroy {
  private readonly dialog = inject(Dialog)
  private readonly router = inject(Router)
  private readonly viewContainerRef = inject(ViewContainerRef)
  private settingsDialog: DialogRef<void, AssistantSettingsComponent> | null = null
  private destroyed = false

  ngOnInit() {
    this.settingsDialog = this.dialog.open<void, unknown, AssistantSettingsComponent>(AssistantSettingsComponent, {
      viewContainerRef: this.viewContainerRef,
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog',
      ariaLabelledBy: 'assistant-settings-title',
      autoFocus: '#assistant-settings-title'
    })
    this.settingsDialog.closed.subscribe(() => {
      if (!this.destroyed && this.router.url.split('?')[0] === '/chat/clawxpert/settings') {
        void this.router.navigateByUrl('/chat/clawxpert/c')
      }
    })
  }

  ngOnDestroy() {
    this.destroyed = true
    this.settingsDialog?.close()
  }
}
