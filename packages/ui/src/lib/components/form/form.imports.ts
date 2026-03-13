import {
  ZardFormControlComponent,
  ZardFormFieldComponent,
  ZardFormLabelComponent,
  ZardFormMessageComponent,
  ZardFormPrefixDirective,
  ZardFormSuffixDirective,
} from './form.component';
import { ZardRadioComponent, ZardRadioGroupComponent } from '../radio';
import { ZardToggleGroupComponent, ZardToggleGroupItemComponent } from '../toggle-group';
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
  ZardToggleGroupComponent,
  ZardToggleGroupItemComponent,
  ZardSwitchComponent
] as const;
