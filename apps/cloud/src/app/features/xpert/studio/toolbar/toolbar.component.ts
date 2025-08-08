import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { AppearanceDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { OverlayAnimations } from '@metad/core'
import { XpertStudioComponent } from '../studio.component'
import { XpertStudioApiService } from '../domain'
import { XpertStudioContextMenuComponent } from '../components'
import { MatTooltipModule } from '@angular/material/tooltip'

@Component({
  selector: 'xpert-studio-toolbar',
  standalone: true,
  imports: [
    CommonModule,
    CdkMenuModule,
    TranslateModule,
    MatTooltipModule,
    AppearanceDirective,

    XpertStudioContextMenuComponent
  ],
  templateUrl: './toolbar.component.html',
  styleUrl: './toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [OverlayAnimations]
})
export class XpertStudioToolbarComponent {
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly apiService = inject(XpertStudioApiService)

  public zoomScales = [200, 100, 75, 50, 25]
  get fZoomScale() {
    return Number((this.xpertStudioComponent.fZoom().getScale() * 100).toFixed(0))
  }

  readonly historyHasPast = this.apiService.historyHasPast
  readonly historyHasFuture = this.apiService.historyHasFuture

  readonly histories = computed(() => {
    const history = this.apiService.stateHistories()
    const histories = [...history.past, ...history.future]
    return histories.reverse()
  })
  get historyCursor() {
    return this.apiService.getHistoryCursor()
  }

  public onZoomIn(): void {
    this.xpertStudioComponent.fZoom().zoomIn()
  }
  public onZoomOut(): void {
    this.xpertStudioComponent.fZoom().zoomOut()
  }
  public onZoomTo(level: number) {
    if (this.fZoomScale < level) {
      while (this.fZoomScale < level) {
        this.xpertStudioComponent.fZoom().zoomIn()
      }
    } else if (this.fZoomScale > level) {
      while (this.fZoomScale > level) {
        this.xpertStudioComponent.fZoom().zoomOut()
      }
    }
  }
  public onFitToScreen(): void {
    this.xpertStudioComponent.fCanvasComponent().fitToScreen()
  }

  public onOneToOne(): void {
    this.xpertStudioComponent.fCanvasComponent().resetScaleAndCenter()
  }

  undo() {
    this.apiService.undo()
  }

  redo() {
    this.apiService.redo()
  }

  onGoToHistory(index: number) {
    // goto the index (reversed)
    this.apiService.gotoHistoryIndex(this.histories().length - index)
  }

  clearHistory() {
    this.apiService.clearHistory()
  }

  autoLayout() {
    this.apiService.autoLayout()
  }
}
