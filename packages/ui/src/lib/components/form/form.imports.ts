import {
  ZardFormControlComponent,
  ZardFormFieldComponent,
  ZardFormLabelComponent,
  ZardFormMessageComponent,
  ZardFormPrefixDirective,
  ZardFormSuffixDirective,
} from './form.component';
import { ZardRadioComponent, ZardRadioGroupComponent } from '../radio';

export const ZardFormImports = [
  ZardFormFieldComponent,
  ZardFormLabelComponent,
  ZardFormControlComponent,
  ZardFormMessageComponent,
  ZardFormPrefixDirective,
  ZardFormSuffixDirective,
  ZardRadioComponent,
  ZardRadioGroupComponent,
] as const;
