import { ComponentPortal, PortalModule } from '@angular/cdk/portal'
import { ChangeDetectorRef, Component, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { filter } from 'rxjs/operators'
import { NxSettingsPanelService } from '../settings-panel/settings-panel.service'

@Component({
  standalone: true,
  selector: 'pac-designer-panel',
  templateUrl: './panel.component.html',
  styleUrls: ['./panel.component.scss'],
  imports: [PortalModule],
  host: {
    class: 'pac-designer-panel'
  }
})
export class DesignerPanelComponent {
  private designerService = inject(NxSettingsPanelService)
  private _cdr = inject(ChangeDetectorRef)

  settingsPortal: ComponentPortal<unknown>

  // Subscribers
  private _settingsComponentSub = this.designerService.settingsComponent$
    .pipe(filter(Boolean), takeUntilDestroyed())
    .subscribe(({ settingsPortals, drawer, title }) => {
      this._cdr.markForCheck()
      this._cdr.detectChanges()
    })
}
