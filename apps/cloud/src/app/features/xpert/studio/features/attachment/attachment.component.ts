import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSliderModule } from '@angular/material/slider'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Attachment_Type_Options, TXpertAttachment, TXpertAttachmentType } from '@cloud/app/@core/types'
import { attrModel, OverlayAnimations } from '@metad/core'
import { NgmI18nPipe, TSelectOption } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertStudioApiService } from '../../domain'
import { linkedXpertFeaturesModel } from '../types'

@Component({
  selector: 'xpert-studio-features-attachment',
  standalone: true,
  imports: [CommonModule, FormsModule, CdkMenuModule, TranslateModule, MatTooltipModule, MatSliderModule, NgmI18nPipe],
  templateUrl: './attachment.component.html',
  styleUrl: './attachment.component.scss',
  animations: [...OverlayAnimations]
})
export class XpertStudioFeaturesAttachmentComponent {
  readonly apiService = inject(XpertStudioApiService)

  readonly features = linkedXpertFeaturesModel(this.apiService)

  readonly attachment = attrModel(this.features, 'attachment')
  readonly type = attrModel(this.attachment, 'type')
  readonly maxNum = attrModel(this.attachment, 'maxNum')
  readonly fileTypes = attrModel(this.attachment, 'fileTypes')

  readonly TypeOptions: TSelectOption<TXpertAttachment['type']>[] = [
    {
      value: 'upload',
      label: {
        zh_Hans: '本地上传',
        en_US: 'Local Upload'
      }
    },
    {
      value: 'url',
      label: {
        zh_Hans: '链接',
        en_US: 'Url'
      }
    },
    {
      value: 'all',
      label: {
        zh_Hans: '所有',
        en_US: 'All'
      }
    }
  ]

  readonly fileTypeOptions = Attachment_Type_Options

  selectType(type: TXpertAttachment['type']) {
    this.type.set(type)
  }

  formatLabel(value: number): string {
    return `${value}`;
  }

  includeType(type: TXpertAttachmentType) {
    return this.fileTypes()?.includes(type)
  }

  toggleFileType(type: TXpertAttachmentType) {
    this.fileTypes.update((types) => {
      if (types?.includes(type)) {
        return types.filter((_) => _ !== type)
      }
      return [...(types ?? []), type]
    })
  }
}
