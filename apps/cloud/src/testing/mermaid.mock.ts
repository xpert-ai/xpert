const mermaid = {
  initialize: jest.fn(),
  parse: jest.fn(async () => true),
  render: jest.fn(async (id: string, code: string) => ({
    svg: `<svg data-mermaid-id="${id}">${code}</svg>`
  }))
}

export default mermaid
