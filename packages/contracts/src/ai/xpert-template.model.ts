import { TAvatar } from '../types'
import { XpertTypeEnum } from './xpert.model'

export interface IXpertTemplate {
  id: string
  name: string
  title: string
  description: string
  avatar: TAvatar
  type: XpertTypeEnum
  category: string
  copyright: string
  privacyPolicy?: string
  export_data: string
}
