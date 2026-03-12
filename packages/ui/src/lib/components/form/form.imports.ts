import {
  ZardFormControlComponent,
  ZardFormFieldComponent,
  ZardFormLabelComponent,
  ZardFormMessageComponent,
  ZardFormPrefixDirective,
  ZardFormSuffixDirective
} from './form.component'
import { ZardRadioComponent, ZardRadioGroupComponent } from '../radio'
import { ZardSwitchComponent } from '../switch'

export const ZardFormImports = [
  ZardFormFieldComponent,
  ZardFormLabelComponent,
  ZardFormControlComponent,
  ZardFormMessageComponent,
  ZardFormPrefixDirective,
  ZardFormSuffixDirective,
  ZardRadioComponent,
  ZardRadioGroupComponent,
  ZardSwitchComponent
] as const
