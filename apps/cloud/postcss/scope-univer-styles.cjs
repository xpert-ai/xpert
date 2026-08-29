const path = require('node:path')
const postcss = require('postcss')
const selectorParser = require('postcss-selector-parser')

const UNIVER_STYLESHEET_SUFFIX = '/node_modules/@univerjs/preset-sheets-core/lib/index.css'
const UNIVER_SCOPE_ROOTS = '.xp-univer-style-scope, [data-u-comp], [class*="univer-"]'
const KEYFRAME_NAMES = new Map([
  ['enter', 'xp-univer-enter'],
  ['exit', 'xp-univer-exit']
])

function normalizePath(filePath) {
  return path.resolve(filePath).replaceAll(path.sep, '/')
}

function isUniverStylesheet(filePath) {
  return typeof filePath === 'string' && normalizePath(filePath).endsWith(UNIVER_STYLESHEET_SUFFIX)
}

function createScopeNode() {
  return selectorParser().astSync(`:where(${UNIVER_SCOPE_ROOTS})`).first.first.clone()
}

function scopeSelectors(selector) {
  return selectorParser((root) => {
    const scopedSelectors = []

    root.each((originalSelector) => {
      const descendantSelector = originalSelector.clone()
      descendantSelector.prepend(selectorParser.combinator({ value: ' ' }))
      descendantSelector.prepend(createScopeNode())
      scopedSelectors.push(descendantSelector)

      const scopeRootSelector = originalSelector.clone()
      const firstNode = scopeRootSelector.first
      if (firstNode?.type === 'universal') {
        firstNode.replaceWith(createScopeNode())
      } else if (firstNode?.type === 'tag') {
        scopeRootSelector.insertAfter(firstNode, createScopeNode())
      } else {
        scopeRootSelector.prepend(createScopeNode())
      }
      scopedSelectors.push(scopeRootSelector)
    })

    root.removeAll()
    root.append(scopedSelectors)
  }).processSync(selector)
}

function isInsideKeyframes(rule) {
  for (let parent = rule.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) {
      return true
    }
  }
  return false
}

function renameAnimationReferences(value) {
  return value.replace(/\b(enter|exit)\b/g, (name) => KEYFRAME_NAMES.get(name) ?? name)
}

function scopeUniverStyles() {
  return {
    postcssPlugin: 'scope-univer-styles',
    Once(root, { result }) {
      if (!isUniverStylesheet(result.opts.from)) {
        return
      }

      root.walkRules((rule) => {
        if (!isInsideKeyframes(rule)) {
          rule.selector = scopeSelectors(rule.selector)
        }
      })

      root.walkAtRules((atRule) => {
        if (/keyframes$/i.test(atRule.name)) {
          atRule.params = KEYFRAME_NAMES.get(atRule.params) ?? atRule.params
        }
      })

      root.walkDecls((declaration) => {
        if (declaration.prop === 'animation' || declaration.prop === 'animation-name') {
          declaration.value = renameAnimationReferences(declaration.value)
        }
      })

      const vendorLayer = postcss.atRule({ name: 'layer', params: 'vendor' })
      while (root.first) {
        vendorLayer.append(root.first)
      }
      root.append(vendorLayer)
    }
  }
}

scopeUniverStyles.postcss = true

module.exports = scopeUniverStyles
