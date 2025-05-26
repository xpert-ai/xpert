// echarts-viewer.component.ts
import { CommonModule } from '@angular/common';
import { Component, Input, AfterViewInit, ElementRef } from '@angular/core';
import * as echarts from 'echarts';

@Component({
  standalone: true,
  imports: [
    CommonModule,
  ],
  selector: 'chat-echarts-viewer',
  template: `<div class="echarts-container" style="width: 100%; height: 400px;"></div>`
})
export class EchartsViewerComponent implements AfterViewInit {
  @Input() options!: any;

  constructor(private el: ElementRef) {}

  ngAfterViewInit() {
    const chart = echarts.init(this.el.nativeElement.querySelector('.echarts-container'));
    chart.setOption(this.options);
  }
}
