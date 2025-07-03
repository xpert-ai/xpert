import { TSelectOption } from "../types";
import { TXpertAttachmentType, XpertParameterTypeEnum } from "./xpert.model"

export type TErrorHandling = {
  type?: null | 'defaultValue' | 'failBranch'
  defaultValue?: {content?: string; } & Record<string, any>
  failBranch?: string
}

export enum ApiAuthType {
  /**
   * Enum class for api provider auth type.
   */
  NONE = "none",
  API_KEY = "api_key",
  BASIC = 'basic'
}

/**
 * Reference variable (parameter)
 */
export type TXpertRefParameter = {
  type?: XpertParameterTypeEnum
  name: string
  optional?: boolean
  /**
   * Referencing other variable
   */
  variable?: string
}

export const Attachment_Type_Options: TSelectOption<string, TXpertAttachmentType>[] = [
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