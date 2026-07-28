import { NgModule } from '@angular/core'
import { OcapCoreModule } from '../core'
import { NgmCheckboxComponent } from './checkbox/checkbox.component'
import { NgmCopyComponent } from './copy/copy.component'
import { NgmHighlightDirective, NgmResizableDirective } from './directives'
import { NgmDisplayBehaviourComponent } from './display-behaviour'
import { NgmDrawerTriggerComponent } from './drawer-trigger/drawer-trigger.component'
import { NgmInputComponent } from './input/input.component'
import { NgmProgressSpinnerComponent } from './progress-spinner/spinner.component'
import { NgmRadioSelectComponent } from './radio-select/select.component'
import { NgmRemoteSelectComponent } from './remote-select/select.component'
import { NgmSearchComponent } from './search/search.component'
import { NgmSelectComponent } from './select/select/select.component'
import { NgmSliderInputComponent } from './slider-input/slider-input.component'
import { NgmSpinComponent } from './spin/spin.component'
import { NgmStepperComponent } from './stepper/stepper.component'
import { NgmTableComponent } from './table/table/table.component'
import { NgmTagsComponent } from './tag/tag.component'

const COMMON_IMPORTS = [
  OcapCoreModule,
  NgmHighlightDirective,
  NgmResizableDirective,
  NgmDisplayBehaviourComponent,
  NgmSearchComponent,
  NgmSelectComponent,
  NgmSliderInputComponent,
  NgmTagsComponent,
  NgmInputComponent,
  NgmDrawerTriggerComponent,
  NgmTableComponent,
  NgmSpinComponent,
  NgmCheckboxComponent,
  NgmStepperComponent,
  NgmCopyComponent,
  NgmProgressSpinnerComponent,
  NgmRadioSelectComponent,
  NgmRemoteSelectComponent
]

/**
 * Compatibility module for the remaining pre-Zard standalone UI primitives.
 * New code should import the standalone component or directive directly.
 */
@NgModule({
  imports: COMMON_IMPORTS,
  exports: COMMON_IMPORTS
})
export class NgmCommonModule {}
