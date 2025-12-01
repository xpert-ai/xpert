import { Component } from '@angular/core'
import { AbstractStoryWidget } from '@metad/core'
import { map, startWith, tap } from 'rxjs/operators'

export interface IframeWidgetOptions {
  src: string
}

@Component({
  selector: 'ngm-story-widget-iframe',
  templateUrl: './iframe.component.html',
  styleUrls: ['./iframe.component.scss']
})
export class NxWidgetIframeComponent extends AbstractStoryWidget<IframeWidgetOptions> {

  public readonly placeholder$ = this.options$.pipe(
    startWith(null),
    map((options) => !options?.src)
  )
  public readonly src$ = this.options$.pipe(
    map((options) => options?.src || 'https://xpertai.cn'),
  )
}
