import { Component } from '@angular/core'
import { FieldWrapper, FormlyFieldConfig } from '@ngx-formly/core'
import { isNil } from 'lodash-es'
import type { ZardAccordionItemLike, ZardSwitchChange } from '@xpert-ai/headless-ui'

@Component({
  selector: 'ngm-formly-accordion',
  standalone: false,
  templateUrl: './accordion-wrapper.component.html',
  styleUrls: ['./accordion-wrapper.component.scss'],
  host: {
    class: 'ngm-formly-accordion'
  }
})
export class NgmFormlyAccordionComponent<F extends FormlyFieldConfig = FormlyFieldConfig> extends FieldWrapper<F> {
  onToggle(event: ZardSwitchChange, field: FormlyFieldConfig, expansionPanel: ZardAccordionItemLike) {
    this.formControl.patchValue({
      [field.props.keyShow]: event.checked
    })

    if (this.formControl.value[field.props.keyShow]) {
      expansionPanel?.open()
    } else {
      expansionPanel?.close()
    }
  }

  isShow(item: FormlyFieldConfig) {
    return (
      (isNil(this.model?.[item.props.keyShow]) && !!this.model?.[item.key as string]) ||
      this.model?.[item.props.keyShow]
    )
  }
}
