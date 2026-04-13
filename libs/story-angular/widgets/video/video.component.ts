import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { DomSanitizer } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import { AbstractStoryWidget } from '@xpert-ai/core'
import { distinctUntilChanged, map } from 'rxjs/operators'

export interface VideoWidgetOptions {
  videoUrl?: string
  imageObj?: {
    id?: string
    url?: string
  }
  imageSizeMode?: 'strecth' | 'fitWidth' | 'fitHeight' | 'originalSize'
}

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule],
  selector: 'ngm-story-widget-video',
  templateUrl: './video.component.html',
  styleUrls: ['./video.component.scss']
})
export class NxWidgetVideoComponent extends AbstractStoryWidget<VideoWidgetOptions> {
  private readonly domSanitizer = inject(DomSanitizer)

  classes = {}

  public videoUrl$ = this.options$.pipe(
    map((options) => options?.imageObj?.url ?? options?.videoUrl),
    distinctUntilChanged(),
    map((url) => (url ? this.domSanitizer.bypassSecurityTrustResourceUrl(url) : null))
  )

  private imageSizeModeSub = this.options$
    .pipe(
      map((options) => options?.imageSizeMode ?? 'strecth'),
      distinctUntilChanged()
    )
    .subscribe((mode) => {
      switch (mode) {
        case 'strecth':
          this.classes = {
            strecth: true
          }
          break
        case 'fitWidth':
          this.classes = {
            'fit-width': true
          }
          break
        case 'fitHeight':
          this.classes = {
            'fit-height': true
          }
          break
        case 'originalSize':
          this.classes = {
            'original-size': true
          }
          break
        default:
          this.classes = {}
          break
      }
    })
}
