import ShortUniqueId from 'short-unique-id'
import type * as z3 from "zod/v3";
import type * as z4 from "zod/v4/core";

const uuidGenerator = new ShortUniqueId({ length: 10 })
export const uuid = (...args: Parameters<(typeof uuidGenerator)['randomUUID']>) =>
  uuidGenerator.randomUUID(...args)

/**
 * @description
 * An entity ID. Represents a unique identifier as a string.
 *
 * @docsCategory Type Definitions
 * @docsSubcategory Identifiers
 */
export type ID = string;

export interface I18nObject {
  en_US: string
  zh_Hans?: string
}

export type TAvatar = {
  emoji?: {
    id: string
    set?: '' | 'apple' | 'google' | 'twitter' | 'facebook'
    colons?: string
    unified?: string
  }
  /**
   * Use Noto Color Emoji:
   * https://fonts.google.com/noto/specimen/Noto+Color+Emoji/
   */
  useNotoColor?: boolean
  background?: string
  url?: string
}

export type TDeleteResult = {
  /**
   * Raw SQL result returned by executed query.
   */
  raw: any;
  /**
   * Number of affected rows/documents
   * Not all drivers support this
   */
  affected?: number | null;
}

export type TranslateOptions = {
	lang?: string;
  args?: ({
      [k: string]: any;
  } | string)[] | {
      [k: string]: any;
  };
  debug?: boolean;
}

/**
 * Select option type
 */
export type TSelectOption<T = string | number | boolean, K = string> = {
  key?: K
  value: T

  label?: I18nObject | string
  description?: I18nObject | string
  icon?: string
}

// Parameters
export enum ParameterTypeEnum {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  ARRAY = 'array',
  SELECT = 'select',
  SECRET_INPUT = 'secret-input',
  FILE = 'file'
}

export type TParameterOption = {
  value: string
  label: I18nObject
}

export type TParameterHelpInfo = {
  title: I18nObject;
  url: I18nObject;
}

export type TParameter = {
  name: string
  label: I18nObject
  placeholder?: I18nObject
  description?: I18nObject
  type: ParameterTypeEnum
  required?: boolean
  default?: number | string
  min?: number
  max?: number
  options?: TParameterOption[]
  items?: {
    type: ParameterTypeEnum
  }
  when?: Record<string, unknown[]>

  /**
   * Is visible for parameters
   */
  visible?: boolean

  help?: TParameterHelpInfo
}

export type TParameterSchema = {
  type: 'object' | 'array'
  required?: string[]
  secret?: string[]
  /**
   * @deprecated use parameters
   */
  properties?: any
  parameters?: TParameter[]
}

export interface IPoint {
  x: number
  y: number
}

export interface ISize {
  width: number
  height: number
}

export type _TFile = {
  filePath: string;
  fileUrl?: string;
  mimeType?: string;
  /**
   * @deprecated use fileUrl instead
   */
  url?: string;
}

/**
 * A recursive implementation of the Partial<T> type.
 * Source: https://stackoverflow.com/a/49936686/772859
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends Readonly<infer U>[]
      ? Readonly<DeepPartial<U>>[]
      : DeepPartial<T[P]>
}

export interface ChecklistItem {
  node?: string
	field?: string // Incorrect field name, such as role, hierarchy
  value?: string // Optional: value of the field, such as role name
	message: I18nObject
	level: 'error' | 'warning'
	ruleCode?: string // Optional: unique internal rule number (such as DIM_ROLE_INVALID)
}

export interface RuleValidator {
	validate(input: any, params?: any): Promise<ChecklistItem[]>
}

export function letterStartSUID(start: string) {
  return start + uuid()
}

/** 
 * The type of icon to render.  
 * Determines how the `value` field should be interpreted.
 */
export type IconType = 'image' | 'svg' | 'font' | 'emoji' | 'lottie'

/**
 * Defines a unified structure for representing different kinds of icons 
 * in the frontend (image, SVG, font icon, emoji, Lottie animation, etc.).
 * 
 * ---
 * 🧩 Supported icon types:
 * 
 * | Type     | Description                      | Example `value` |
 * |-----------|----------------------------------|-----------------|
 * | `image`  | Raster or Base64-encoded image    | `"https://cdn.example.com/logo.png"` or `"data:image/png;base64,..."` |
 * | `svg`    | Inline SVG markup                 | `"<svg xmlns='http://www.w3.org/2000/svg'><path d='M12 2l4 20H8z'/></svg>"` |
 * | `font`   | Font icon class name              | `"fa-solid fa-user"` or `"material-icons:home"` |
 * | `emoji`  | Unicode emoji character           | `"🚀"` |
 * | `lottie` | Lottie animation JSON URL         | `"https://assets.lottiefiles.com/packages/lf20_abc123.json"` |
 * 
 * ---
 * 🧠 Example usages:
 * 
 * ```json
 * {
 *   "icon": {
 *     "type": "image",
 *     "value": "https://cdn.example.com/logo.png",
 *     "alt": "Company logo"
 *   }
 * }
 * 
 * {
 *   "icon": {
 *     "type": "svg",
 *     "value": "<svg xmlns='http://www.w3.org/2000/svg'><path d='M12 2l4 20H8z'/></svg>"
 *   }
 * }
 * 
 * {
 *   "icon": {
 *     "type": "font",
 *     "value": "fa-solid fa-user",
 *     "color": "#666",
 *     "size": 20
 *   }
 * }
 * 
 * {
 *   "icon": {
 *     "type": "emoji",
 *     "value": "🚀",
 *     "size": 32
 *   }
 * }
 * 
 * {
 *   "icon": {
 *     "type": "lottie",
 *     "value": "https://assets.lottiefiles.com/packages/lf20_abc123.json"
 *   }
 * }
 * ```
 * ---
 */
export interface IconDefinition {
  /** 
   * The type of icon to render.  
   * Determines how the `value` field should be interpreted.
   */
  type: IconType

  /** 
   * The icon content or resource reference.
   * Can be a URL, Base64 data, SVG markup, emoji, or animation file.
   */
  value: string

  /** 
   * Optional color for the icon.  
   * Typically used for font, SVG, or emoji icons.
   */
  color?: string

  /** 
   * Optional size of the icon, in pixels.  
   * Defines the intended rendered size (e.g. 24 → 24px).
   */
  size?: number

  /** 
   * Alternative text for accessibility.  
   * Useful for image or SVG icons.
   */
  alt?: string

  /** 
   * Optional inline style definitions.  
   * Can include any CSS-compatible properties 
   * (e.g. `{ "borderRadius": "50%", "backgroundColor": "#f0f0f0" }`).
   */
  style?: Record<string, string>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ZodObjectV3 = z3.ZodObject<any, any, any, any>;
export type ZodObjectV4 = z4.$ZodObject;
export type InteropZodObject = ZodObjectV3 | ZodObjectV4;