import { PdfVisualTransformerStrategy } from './pdf-visual-transformer.strategy'
import { TextTransformerStrategy } from './text-transformer.strategy'
import { DefaultTransformerStrategy } from './transformer.strategy'

export * from './pdf-visual-transformer.strategy'
export * from './text-transformer.strategy'
export * from './transformer.strategy'
export * from './types'

export const TransformerCommonStrategies = [
    DefaultTransformerStrategy,
    PdfVisualTransformerStrategy,
    TextTransformerStrategy
]
