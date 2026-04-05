import { Injectable } from '@nestjs/common'
import { LongTermMemoryTypeEnum, MemoryAudienceEnum } from '@metad/contracts'
import { MemoryAudience, MemoryWritePolicy } from './types'

const USER_HINTS = [
  'prefer',
  'preference',
  'usually',
  'likes',
  'dislikes',
  '个人',
  '偏好',
  '习惯',
  '口味',
  '常用',
  '我的',
  'i prefer',
  'i like',
  'i dislike'
]

const SHARED_HINTS = [
  'standard',
  'policy',
  'rule',
  'workflow',
  'playbook',
  '项目',
  '规则',
  '标准',
  '话术',
  '业务',
  '流程',
  '约定',
  '共享'
]

@Injectable()
export class DefaultMemoryWritePolicy implements MemoryWritePolicy {
  resolveAudience(input: {
    kind: LongTermMemoryTypeEnum
    title?: string | null
    content?: string | null
    context?: string | null
    tags?: string[] | null
    explicitAudience?: MemoryAudience | null
  }): MemoryAudience {
    if (input.explicitAudience === MemoryAudienceEnum.USER || input.explicitAudience === MemoryAudienceEnum.SHARED) {
      return input.explicitAudience
    }

    const haystack = [input.title, input.content, input.context, ...(input.tags ?? [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    if (containsAny(haystack, SHARED_HINTS)) {
      return MemoryAudienceEnum.SHARED
    }
    if (input.kind === LongTermMemoryTypeEnum.PROFILE || containsAny(haystack, USER_HINTS)) {
      return MemoryAudienceEnum.USER
    }
    return MemoryAudienceEnum.SHARED
  }
}

function containsAny(text: string, hints: string[]) {
  return hints.some((hint) => text.includes(hint))
}
