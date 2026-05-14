import { ISelectOption } from '../core'

export interface ITagOption<T = unknown> extends ISelectOption<T> {
  color?: string
}
