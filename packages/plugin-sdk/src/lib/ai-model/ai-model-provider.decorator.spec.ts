import path from 'path'
import { AIModelProviderStrategy, resolveStackFramePath } from './ai-model-provider.decorator'

describe('AIModelProviderStrategy stack frame resolution', () => {
  describe('resolveStackFramePath', () => {
    it('resolves an ESM file URL on POSIX', () => {
      expect(resolveStackFramePath('    at file:///home/u/proj/dist/provider.strategy.js:12:5')).toBe(
        '/home/u/proj/dist/provider.strategy.js'
      )
    })

    it('resolves a CJS absolute path on POSIX', () => {
      expect(resolveStackFramePath('    at Object.<anonymous> (/home/u/proj/dist/provider.strategy.js:12:5)')).toBe(
        '/home/u/proj/dist/provider.strategy.js'
      )
    })

    it('resolves an ESM file URL on Windows', () => {
      // The bug this guards against: stripping `file://` with a plain replace leaves
      // "/C:/.../dist", which is not a valid Windows path.
      expect(resolveStackFramePath('    at file:///C:/dev/xpert/dist/provider.strategy.js:12:5')).toBe(
        path.join('C:', 'dev', 'xpert', 'dist', 'provider.strategy.js')
      )
    })

    it('resolves a CJS drive-letter path on Windows', () => {
      expect(resolveStackFramePath('    at Object.<anonymous> (C:\\dev\\xpert\\dist\\provider.strategy.js:12:5)')).toBe(
        path.join('C:', 'dev', 'xpert', 'dist', 'provider.strategy.js')
      )
    })

    it('decodes percent-escaped path segments', () => {
      expect(resolveStackFramePath('    at file:///C:/dev/%E9%A1%B9%E7%9B%AE/dist/a.js:3:1')).toBe(
        path.join('C:', 'dev', '项目', 'dist', 'a.js')
      )
    })

    it('does not leak the line/column position into the path', () => {
      const resolved = resolveStackFramePath('    at file:///C:/dev/xpert/dist/a.js:12345:67')
      expect(resolved).not.toMatch(/:\d+:\d+$/)
    })

    it('returns undefined for frames it cannot parse', () => {
      expect(resolveStackFramePath(undefined)).toBeUndefined()
      expect(resolveStackFramePath('    at <anonymous>')).toBeUndefined()
      expect(resolveStackFramePath('    at async Promise.all (index 0)')).toBeUndefined()
    })
  })

  describe('decorator metadata', () => {
    it('records the directory of the file that applies the decorator', () => {
      class Provider {}
      AIModelProviderStrategy('test-provider')(Provider)

      // This spec file is the decorator's caller, so the recorded directory is this one.
      expect(Reflect.getMetadata('AI_MODEL_PROVIDER_DIR', Provider)).toBe(__dirname)
      expect(Reflect.getMetadata('AI_MODEL_PROVIDER', Provider)).toBe('test-provider')
    })
  })
})
