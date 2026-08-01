import { NgModule } from '@angular/core'
import { OcapCoreModule } from '../core'
import { XpCheckboxComponent } from './checkbox/checkbox.component'
import { XpCopyComponent } from './copy/copy.component'
import { XpHighlightDirective, XpResizableDirective } from './directives'
import { XpDisplayBehaviourComponent } from './display-behaviour'
import { XpDrawerTriggerComponent } from './drawer-trigger/drawer-trigger.component'
import { XpInputComponent } from './input/input.component'
import { XpProgressSpinnerComponent } from './progress-spinner/spinner.component'
import { XpRadioSelectComponent } from './radio-select/select.component'
import { XpRemoteSelectComponent } from './remote-select/select.component'
import { XpSearchComponent } from './search/search.component'
import { XpSelectComponent } from './select/select/select.component'
import { XpSliderInputComponent } from './slider-input/slider-input.component'
import { XpSpinComponent } from './spin/spin.component'
import { XpStepperComponent } from './stepper/stepper.component'
import { XpTableComponent } from './table/table/table.component'
import { XpTagsComponent } from './tag/tag.component'

const COMMON_IMPORTS = [
  OcapCoreModule,
  XpHighlightDirective,
  XpResizableDirective,
  XpDisplayBehaviourComponent,
  XpSearchComponent,
  XpSelectComponent,
  XpSliderInputComponent,
  XpTagsComponent,
  XpInputComponent,
  XpDrawerTriggerComponent,
  XpTableComponent,
  XpSpinComponent,
  XpCheckboxComponent,
  XpStepperComponent,
  XpCopyComponent,
  XpProgressSpinnerComponent,
  XpRadioSelectComponent,
  XpRemoteSelectComponent
]

/**
 * Compatibility module for the remaining pre-Zard standalone UI primitives.
 * New code should import the standalone component or directive directly.
 */
@NgModule({
  imports: COMMON_IMPORTS,
  exports: COMMON_IMPORTS
})
export class XpCommonModule {}
