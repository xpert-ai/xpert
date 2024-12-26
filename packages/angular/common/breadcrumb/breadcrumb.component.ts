import { CommonModule } from '@angular/common'
import { Component, EventEmitter, HostBinding, Input, OnChanges, Output, SimpleChanges } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { MatTooltipModule } from '@angular/material/tooltip'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'

export interface Step {
  value: any
  label: string
  active?: boolean
}

@Component({
  standalone: true,
  selector: 'ngm-breadcrumb-bar',
  templateUrl: './breadcrumb.component.html',
  host: {class: 'ngm-breadcrumb-bar'},
  styleUrls: ['breadcrumb.component.scss'],
  imports: [
    CommonModule,
    TranslateModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    OcapCoreModule
  ]
})
export class NgmBreadcrumbBarComponent implements OnChanges {
  @Input()
  public steps: Step[] = []

  @HostBinding('class.disabled')
  @Input()
  public disabled = false

  @Output() selectedChange = new EventEmitter()
  @Output() close = new EventEmitter()

  activeLink: Step

  ngOnChanges({ steps }: SimpleChanges): void {
    // 使用最后一个激活元素作为激活元素
    this.activeLink = steps?.currentValue
      ?.slice()
      .reverse()
      .find((x) => x.active)
  }

  onClick(step) {
    let i = this.steps?.indexOf(step)
    // 如果点击了最后一个选中元素则取消选中此元素
    if (step.active && !this.steps[i + 1]?.active) {
      i--
    }
    this.steps.forEach((value, index) => (value.active = index <= i))
    this.selectedChange.emit(this.steps.filter((value) => value.active))
  }

  onClose() {
    this.close.emit()
  }
}
