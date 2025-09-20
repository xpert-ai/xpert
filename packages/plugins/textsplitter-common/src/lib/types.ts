import { TiktokenModel } from "js-tiktoken"

export const RecursiveCharacter = 'recursive-character'
export const MarkdownRecursive = 'markdown-recursive'
export const ParentChild = 'parent-child'


type TextSplitOptions = {
  separator?: string      // Delimiters/identifiers used to separate blocks, such as "\n", "\n\n", regular expressions, etc.
  maxTokens?: number
}

export type TParentChildConfig = {
  parent: TextSplitOptions & {
    mode?: 'paragraph' | 'full'; // Split mode, split by paragraph or document as a whole chunk
  };
  child: TextSplitOptions
}

export type ChunkSplitConfig = TextSplitOptions & {
  modelName?: TiktokenModel      // for example: "text-embedding-3-small" / "gpt-4o"
}