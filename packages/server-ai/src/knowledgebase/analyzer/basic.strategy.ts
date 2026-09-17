import { Injectable } from '@nestjs/common'
import { DEFAULT_KNOWLEDGE_KEYWORD_ANALYZER } from '@xpert-ai/contracts'
import { IKeywordAnalyzerStrategy, KeywordAnalyzerStrategy } from '@xpert-ai/plugin-sdk'

@Injectable()
@KeywordAnalyzerStrategy(DEFAULT_KNOWLEDGE_KEYWORD_ANALYZER)
export class BasicKeywordAnalyzer implements IKeywordAnalyzerStrategy {
    readonly meta = {
        id: DEFAULT_KNOWLEDGE_KEYWORD_ANALYZER,
        label: 'Basic (Unicode)',
        languages: ['und'],
        revision: 'basic-unicode-nfkc-v1'
    }

    async analyze(text: string): Promise<readonly string[]> {
        // Keep adjacent letters together; language-specific word segmentation belongs to plugins.
        return (
            text
                .normalize('NFKC')
                .toLowerCase()
                .match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu) ?? []
        )
    }
}
