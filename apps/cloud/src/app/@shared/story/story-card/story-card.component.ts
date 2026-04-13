import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, Input } from '@angular/core'

import { RouterModule } from '@angular/router'
import { NgmHighlightDirective } from '@xpert-ai/ocap-angular/common'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective } from '@xpert-ai/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { formatRelative } from 'date-fns'
import { getDateLocale, IStory } from '../../../@core'
import { LazyImgDirective } from '../../directives/lazy-img.directive'
import { CreatedByPipe } from '../../pipes'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-story-card',
  templateUrl: 'story-card.component.html',
  styleUrl: 'story-card.component.scss',
  imports: [
    CommonModule,
    RouterModule,
    ZardIconComponent,
    ZardButtonComponent,
    TranslateModule,
    DensityDirective,
    ButtonGroupDirective,
    AppearanceDirective,
    CreatedByPipe,

    LazyImgDirective,
    NgmHighlightDirective
  ]
})
export class StoryCardComponent {
  private translateService = inject(TranslateService)
  @Input() story: IStory
  @Input() storyLink: string
  @Input() highlight: string

  get thumbnail() {
    return this.story?.thumbnail || this.story?.preview?.url
  }

  get updatedAt() {
    return this.story
      ? formatRelative(new Date(this.story.updatedAt), new Date(), {
          locale: getDateLocale(this.translateService.currentLang)
        })
      : null
  }
}
