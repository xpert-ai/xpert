import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSliderModule } from '@angular/material/slider'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TXpertAttachment, TXpertAttachmentType } from '@cloud/app/@core/types'
import { attrModel, linkedModel, OverlayAnimations } from '@metad/core'
import { NgmI18nPipe, TSelectOption } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertStudioApiService } from '../../domain'

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

  readonly attachment = linkedModel({
    initialValue: null,
    compute: () => this.apiService.xpert()?.attachment,
    update: (attachment) => {
      this.apiService.updateXpertTeam((xpert) => {
        return {
          ...xpert,
          attachment: {
            ...(xpert.attachment ?? {}),
            ...attachment
          }
        }
      })
    }
  })

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

  readonly fileTypeOptions: TSelectOption<string, TXpertAttachmentType>[] = [
    {
      key: 'document',
      value: 'TXT, MD, MDX, MARKDOWN, PDF, HTML, XLSX, XLS, DOC, DOCX, CSV, EML, MSG, PPTX, PPT, XML, EPUB',
      label: {
        zh_Hans: '文档',
        en_US: 'Document',
      },
    },
    {
      key: 'image',
      value: 'JPG, JPEG, PNG, GIF, WEBP, SVG',
      label: {
        zh_Hans: '图片',
        en_US: 'Image',
      },
    },
    {
      key: 'audio',
      value: 'MP3, M4A, WAV, AMR, MPGA',
      label: {
        zh_Hans: '音频',
        en_US: 'Audio',
      },
    },
    {
      key: 'video',
      value: 'MP4, MOV, MPEG, WEBM',
      label: {
        zh_Hans: '视频',
        en_US: 'Video',
      },
    },
    {
      key: 'others',
      value: '',
      label: {
        zh_Hans: '其他文件类型',
        en_US: 'Other file types',
      },
    }
  ]

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
