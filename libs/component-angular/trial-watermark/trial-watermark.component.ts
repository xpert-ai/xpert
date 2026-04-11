import { Component, ElementRef, Input, OnChanges, Renderer2, ViewEncapsulation } from '@angular/core'
import { NxWatermarkOptions } from './types'
import { WatermarkHandler } from './watermark.handler'

@Component({
  standalone: true,
  encapsulation: ViewEncapsulation.ShadowDom,
  selector: 'ngm-trial-watermark',
  templateUrl: './trial-watermark.component.html',
  styleUrls: ['./trial-watermark.component.scss']
})
export class TrialWatermarkComponent implements OnChanges {
  @Input() options: NxWatermarkOptions

  private watermarkHandler: WatermarkHandler = new WatermarkHandler(this._el, this._renderer)

  constructor(private _el: ElementRef, private _renderer: Renderer2) {}

  ngOnChanges() {
    this.watermarkHandler.generateWatermark(this.options)
  }
}
