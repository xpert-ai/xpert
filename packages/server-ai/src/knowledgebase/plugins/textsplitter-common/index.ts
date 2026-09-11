import { MarkdownRecursiveStrategy } from './markdown-recursive.strategy'
import { ParentChildStrategy } from './parent-child.strategy'
import { RecursiveCharacterStrategy } from './recursive-character.strategy'
import { StructureAwareStrategy } from './structure-aware.strategy'
import { AutoTextSplitterStrategy } from './auto.strategy'

export * from './MarkdownRecursiveTextSplitter'
export * from './markdown-recursive.strategy'
export * from './parent-child.strategy'
export * from './recursive-character.strategy'
export * from './types'
export * from './structure-aware.strategy'
export * from './auto.strategy'

export const TextSplitterCommonStrategies = [
    RecursiveCharacterStrategy,
    MarkdownRecursiveStrategy,
    ParentChildStrategy,
    StructureAwareStrategy,
    AutoTextSplitterStrategy
]
