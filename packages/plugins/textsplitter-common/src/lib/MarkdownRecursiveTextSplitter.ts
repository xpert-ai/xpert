import {
  Document,
  BaseDocumentTransformer,
} from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { v4 as uuid } from 'uuid'

export interface MarkdownHeader {
  level: number;
  text: string;
}

export interface MarkdownRecursiveTextSplitterOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  headersToSplitOn?: number[];
  stripHeader?: boolean; // Whether to remove the header line in the chunk
  addHeadersToChunk?: boolean; // Whether to add the header to the chunk content
}

/**
 * A LangChain document transformer that splits Markdown into
 * recursive character chunks while preserving section headers.
 */
export class MarkdownRecursiveTextSplitter
  extends BaseDocumentTransformer
{
  private chunkSize: number;
  private chunkOverlap: number;
  private headersToSplitOn: number[];
  private stripHeader: boolean;
  private addHeadersToChunk: boolean;

  constructor(options: MarkdownRecursiveTextSplitterOptions = {}) {
    super();
    this.chunkSize = options.chunkSize ?? 1000;
    this.chunkOverlap = options.chunkOverlap ?? 200;
    this.headersToSplitOn = options.headersToSplitOn ?? [1, 2, 3];
    this.stripHeader = options.stripHeader ?? false;
    this.addHeadersToChunk = options.addHeadersToChunk ?? true;
  }

  /**
   * LangChain standard method: transform Documents into chunked Documents.
   */
  async transformDocuments(documents: Document[]): Promise<Document[]> {
    const allDocs: Document[] = [];

    for (const doc of documents) {
      const sections = this.splitByHeaders(doc.pageContent);

      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: this.chunkSize,
        chunkOverlap: this.chunkOverlap,
      });

      for (const section of sections) {
        const docs = await splitter.createDocuments([section.content]);
        for (const d of docs) {
          const headersStr = (this.stripHeader ? section.headers
             : section.headers.slice(0, -1)
            ).map((h) => `${"#".repeat(h.level)} ${h.text}`)
            .join("\n")

          const pageContent = this.addHeadersToChunk && headersStr
            ? headersStr + "\n\n" + d.pageContent
            : d.pageContent;

          allDocs.push(
            new Document({
              pageContent,
              metadata: {
                ...doc.metadata,
                chunkId: uuid(),
                headers: section.headers,
                headerText: headersStr.replace(/\n/g, " / "),
              },
            })
          );
        }
      }
    }

    return allDocs;
  }

  /**
   * Internal: split markdown into header-based sections.
   */
  private splitByHeaders(markdown: string): {
    headers: MarkdownHeader[];
    content: string;
  }[] {
    const lines = markdown.split("\n");
    const sections: { headers: MarkdownHeader[]; contentLines: string[] }[] =
      [];

    let currentHeaders: MarkdownHeader[] = [];
    let currentContent: string[] = [];
    let insideCodeBlock = false;

    const pushSection = () => {
      if (currentContent.length > 0) {
        sections.push({
          headers: [...currentHeaders],
          contentLines: [...currentContent],
        });
        currentContent = [];
      }
    };

    for (const line of lines) {
      if (/^```/.test(line.trim())) {
        insideCodeBlock = !insideCodeBlock;
        currentContent.push(line);
        continue;
      }

      if (!insideCodeBlock) {
        const match = line.match(/^(#{1,6})\s+(.*)$/);
        if (match) {
          const level = match[1].length;
          const text = match[2].trim();

          if (this.headersToSplitOn.includes(level)) {
            pushSection();
            currentHeaders = currentHeaders.filter((h) => h.level < level);
            currentHeaders.push({ level, text });
            if (!this.stripHeader) currentContent.push(line);
            continue;
          }
        }
      }

      currentContent.push(line);
    }

    pushSection();

    return sections.map((s) => ({
      headers: s.headers,
      content: s.contentLines.join("\n").trim(),
    }));
  }
}
