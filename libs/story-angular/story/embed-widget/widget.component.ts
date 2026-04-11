
import { Component, Input, OnChanges, OnInit, SimpleChanges, inject } from '@angular/core'
import { NxCoreService } from '@xpert-ai/core'
import { NgmDSCoreService, NgmSmartFilterBarService } from '@xpert-ai/ocap-angular/core'
import { TimeGranularity } from '@xpert-ai/ocap-core'
import { NxStoryService, Story, StoryWidget } from '@xpert-ai/story/core'
import { NxStoryPointService } from '../story-point.service'
import { NxStoryModule } from '../story.module'

@Component({
  standalone: true,
  imports: [NxStoryModule],
  selector: 'pac-embed-widget',
  templateUrl: './widget.component.html',
  styleUrls: ['./widget.component.scss'],
  providers: [NxStoryService, NxStoryPointService, NgmSmartFilterBarService, NxCoreService]
})
export class EmbedWidgetComponent implements OnInit, OnChanges {
  public storyService = inject(NxStoryService)
  private pointService = inject(NxStoryPointService)
  public smartFilterBarService = inject(NgmSmartFilterBarService)
  private dsCoreService = inject(NgmDSCoreService)

  @Input() story: Story
  @Input() widget: StoryWidget

  ngOnInit(): void {
    this.dsCoreService.setTimeGranularity(TimeGranularity.Month)
  }

  ngOnChanges({ story, widget }: SimpleChanges) {
    if (story.currentValue) {
      this.storyService.setStory(story.currentValue)
    }
    if (widget.currentValue) {
      this.pointService.init(widget.currentValue.point.key)
      this.pointService.active(true)
    }
  }
}
