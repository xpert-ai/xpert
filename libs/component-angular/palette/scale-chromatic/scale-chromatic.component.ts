import { Component, EventEmitter, Input, OnInit, Optional, Output } from '@angular/core'
import { NGXLogger } from 'ngx-logger'
import { NgmChromaticType } from '../types'

@Component({
  selector: 'ngm-scale-chromatic',
  standalone: false,
  templateUrl: './scale-chromatic.component.html',
  styleUrls: ['./scale-chromatic.component.scss'],
})
export class NxScaleChromaticComponent implements OnInit {
  @Input() selected
  // @Input() scaleChromaticService: NxScaleChromaticService

  @Output() selectedChange = new EventEmitter()

  interpolates

  _NxChromaticType = NgmChromaticType
  constructor(
    @Optional()
    private logger?: NGXLogger
  ) {}

  ngOnInit() {
    // this.interpolates = NX_SCALE_CHROMATIC_INTERPOLATES
  }
}
