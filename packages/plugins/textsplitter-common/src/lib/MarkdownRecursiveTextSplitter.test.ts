import { MarkdownRecursiveTextSplitter } from './MarkdownRecursiveTextSplitter'

describe('should test complex usecases', () => {
  it('test splitting for large table', async () => {
    const text = `# 🦜️🔗 LangChain

⚡ Building applications with LLMs through composability ⚡

## Quick Install

\`\`\`bash
# Hopefully this code block isn't split
pip install langchain
\`\`\`

As an open-source project in a rapidly developing field, we are extremely open to contributions.

### More text

LLMs have many applications in industry, including chatbots, content creation, and virtual assistants. They can also be used in academia for research in linguistics, psychology, and computational linguistics.
`

    const markdownSplitter = new MarkdownRecursiveTextSplitter({
      stripHeader: false, // 保留标题在内容里
      headersToSplitOn: [1, 2, 3], // 识别 # 和 ## 和 ###
      // chunkSize: 50,
      // chunkOverlap: 10,
    })
    const result = await markdownSplitter.transformDocuments([{ pageContent: text, metadata: {} }])

    console.log(JSON.stringify(result, null, 2))
  })
})