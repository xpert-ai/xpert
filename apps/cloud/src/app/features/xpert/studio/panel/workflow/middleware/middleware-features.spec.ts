import { middlewareFeatureItems } from './middleware-features'

describe('middlewareFeatureItems', () => {
  const meta = {
    name: 'document-tools',
    label: { en_US: 'Document tools' },
    features: ['documents', 'matching', 'legacy'],
    featureLabels: { matching: { en_US: 'BOM matching', zh_Hans: 'BOM \u5339\u914d' } }
  }

  it('resolves localized view titles only through declared feature bindings', () => {
    const items = middlewareFeatureItems(meta, [
      {
        key: 'contract',
        title: { en_US: 'Contract studio', zh_Hans: '\u5408\u540c\u5de5\u4f5c\u53f0' },
        activation: { requiredFeatures: ['documents'] }
      },
      { key: 'order', title: { en_US: 'Order studio' }, activation: { requiredFeatures: ['documents'] } },
      { key: 'unrelated', title: { en_US: 'Matching documents' }, activation: { requiredFeatures: ['other'] } }
    ])
    expect(items[0].views.map((view) => view.key)).toEqual(['contract', 'order'])
    expect(items[0].views[0].title.zh_Hans).toBe('\u5408\u540c\u5de5\u4f5c\u53f0')
    expect(items[1]).toEqual({ key: 'matching', label: meta.featureLabels.matching, views: [] })
    expect(items[2]).toEqual({ key: 'legacy', label: undefined, views: [] })
  })

  it('deduplicates slot manifests, ignores hidden views and does not grant undeclared features', () => {
    const view = {
      key: 'contract',
      title: { en_US: 'Contract studio' },
      activation: { requiredFeatures: ['documents'] }
    }
    const items = middlewareFeatureItems(
      { ...meta, features: [' documents ', '', 'documents'], featureLabels: { unused: { en_US: 'Unused' } } },
      [view, view, { ...view, key: 'hidden', visible: false }]
    )
    expect(items.map((item) => item.key)).toEqual(['documents'])
    expect(items[0].views).toEqual([{ key: view.key, title: view.title }])
  })

  it('clears the presentation when the selected provider has no metadata', () => {
    expect(middlewareFeatureItems(undefined, [])).toEqual([])
    expect(middlewareFeatureItems({ name: 'guard', label: {} }, [])).toEqual([])
  })

  it('excludes navigation-hidden compatibility entries without merging distinct visible views by title', () => {
    const title = { en_US: 'Contract / Order BOM Studio' }
    const activation = { requiredFeatures: ['documents'] }
    const items = middlewareFeatureItems(meta, [
      { key: 'contract', title, activation },
      { key: 'legacy-order', title, activation, workbench: { fixed: false, menu: { enabled: false } } },
      { key: 'contract', title, activation, workbench: { fixed: true, menu: { enabled: true } } },
      { key: 'another-visible-studio', title, activation, workbench: { menu: { enabled: true } } }
    ])

    expect(items[0].views.map((view) => view.key)).toEqual(['contract', 'another-visible-studio'])
  })
})
