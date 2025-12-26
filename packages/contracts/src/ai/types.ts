import { JsonSchema7TypeUnion } from "zod-to-json-schema";
import { I18nObject, TSelectOption } from "../types";
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

/**
 * Embedding status of an entity, such as an bi indicator or kb document.
 */
export enum EmbeddingStatusEnum {
  PROCESSING = 'processing',
  SUCCESS = 'success',
  FAILED = 'failed',
  REQUIRED = 'required',
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


type JsonSchema7Meta = {
    title?: I18nObject;
    default?: any;
    description?: I18nObject;
    markdownDescription?: I18nObject;
    /**
     * UI schema extensions
     */
    'x-ui'?: {
      /**
       * UI component variant, or custom component name
       */
      component?: 'textarea' | 'select' | 'radio' | 'checkbox' | 'switch' | 'password' | string
      /**
       * UI component display span (for grid layouts)
       */
      span?: number
      /**
       * Additional inputs for the Custom UI component
       */
      inputs?: Record<string, unknown>

      enumLabels?: Record<string, I18nObject | string>;

      styles?: Record<string, string>;
    }
};
export type JsonSchemaObjectType = {
    type: "object";
    properties: Record<string, JsonSchema7Type>;
    additionalProperties?: boolean | JsonSchema7Type;
    required?: string[];
};
type JsonSchema7Type = (JsonSchema7TypeUnion | JsonSchemaObjectType) & JsonSchema7Meta;