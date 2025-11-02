import { openaiCompatible } from './openai-compatible'

describe('openaiCompatible', () => {
  it('should work', () => {
    expect(openaiCompatible()).toEqual('openai-compatible')
  })
})
