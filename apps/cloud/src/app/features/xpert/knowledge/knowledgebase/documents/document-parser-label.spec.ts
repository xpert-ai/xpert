import { IKnowledgeDocument } from '@xpert-ai/contracts'
import { documentParserLabel } from './document-parser-label'

describe('document parser execution label', () => {
  const label = (document: Partial<IKnowledgeDocument>, language = 'zh-Hans') =>
    documentParserLabel(document, language, 'Builtin', 'Not recorded')

  it.each(['builtin', 'default', 'pdf-visual'])(
    'maps executed builtin provider %s to its user-facing label',
    (parser) => {
      expect(label({ metadata: { parser }, parserConfig: { transformerType: 'another-parser' } })).toBe('Builtin')
    }
  )

  it('uses the recorded plugin label even after its configuration or installation changes', () => {
    const document = {
      metadata: {
        parser: 'plugin-parser',
        parserLabel: { en_US: 'Document parser', zh_Hans: 'Document parser ZH' },
        documentAnalysis: { provider: 'stale-provider', engine: 'stale-engine' }
      }
    } as Partial<IKnowledgeDocument>
    expect(label(document)).toBe('Document parser ZH')
    expect(label(document, 'en-US')).toBe('Document parser')
  })

  it('supports old saved transformer and analysis snapshots without inferring execution from settings', () => {
    expect(
      label({
        metadata: { transformSnapshot: { transformer: { provider: 'pdf-visual' } } }
      } as Partial<IKnowledgeDocument>)
    ).toBe('Builtin')
    expect(
      label({
        metadata: { documentAnalysis: { provider: 'Baidu Cloud', engine: 'PaddleOCR-VL' } }
      } as Partial<IKnowledgeDocument>)
    ).toBe('Baidu Cloud · PaddleOCR-VL')
    expect(label({ type: 'xlsx', parserConfig: { transformerType: 'builtin' } })).toBe('Not recorded')
    expect(label({ processMsg: 'PaddleOCR failed before conversion' })).toBe('Not recorded')
    expect(label({ metadata: { parser: 'removed-plugin' } })).toBe('removed-plugin')
    expect(label({ metadata: { parser: 'removed-plugin', parserLabel: ' ' } })).toBe('removed-plugin')
  })

  it('shows historical parser identities when no execution label was saved', () => {
    expect(label({ metadata: { parser: 'mineru' }, parserConfig: { transformerType: 'builtin' } })).toBe('MinerU')
    expect(label({ metadata: { parser: 'baidu-paddleocr-vl' } })).toBe('百度 PaddleOCR-VL')
    expect(label({ metadata: { parser: 'baidu-paddleocr-vl' } }, 'en-US')).toBe('Baidu PaddleOCR-VL')
    expect(label({ metadata: { parser: 'baidu-unlimited-ocr' } })).toBe('百度 Unlimited-OCR')
    expect(
      label({ metadata: { transformSnapshot: { transformer: { provider: 'mineru' } } } } as Partial<IKnowledgeDocument>)
    ).toBe('MinerU')
  })

  it('falls back to saved analysis evidence when an older plugin has no display label', () => {
    expect(
      label({
        metadata: {
          parser: 'legacy-parser',
          documentAnalysis: {
            provider: 'Legacy provider',
            engine: 'Legacy engine'
          }
        }
      } as Partial<IKnowledgeDocument>)
    ).toBe('Legacy provider · Legacy engine')
  })
})
