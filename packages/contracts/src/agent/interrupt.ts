import { I18nObject } from '../types'
import { TToolCall } from './graph'

export type TInterrupt<T = unknown> = {
  id?: string
  value?: T
  when?: 'during'
  resumable?: boolean
  ns?: string[]
}

/**
 *
 * Example:
 *
 * ```typescript
 *  const result = interrupt<TInterruptMessage<{ name: string }>, { projectId: string }>({
 *		category: 'BI',
 *		type: 'switch_project',
 *		title: {
 *			en_US: 'Switch project',
 *			zh_Hans: '切换项目'
 *		},
 *		message: {
 *			en_US: 'Please select a project or create a new one',
 *			zh_Hans: '请选择或创建一个新的项目'
 *		},
 *		data: { name: '' }
 *	})
 * ```
 */
export type TInterruptMessage<T = unknown> = {
  /**
   * Major categories of interrupt components
   */
  category: 'BI'
  /**
   * The specific type of interactive component
   */
  type: string
  /**
   * Title of the interrupt component
   */
  title: string | I18nObject
  /**
   * Message content of the interrupt component
   */
  message: string | I18nObject
  /**
   * Additional data
   */
  data?: T
}

/**
 * Command to resume with streaming after human decision
 */
export type TInterruptCommand = {
  resume?: any
  update?: any
  toolCalls?: TToolCall[]
  agentKey?: string
}

export function isInterruptMessage(obj: unknown): obj is TInterruptMessage {
  return obj && typeof obj === 'object' && 'type' in obj && 'category' in obj
}