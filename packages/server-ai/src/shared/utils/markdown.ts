export function cleanMarkdownForSpeech(markdown: string): string {
  return markdown
    // 替换 markdown 链接 [文本](链接) => 文本
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')

    // 去掉图片 ![文本](图片地址) => 文本
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')

    // 去掉多余的 markdown 语法符号（如 `**加粗**`, `*斜体*`, `# 标题`)
    .replace(/[#_*`~>]/g, '')

    // 去除多余的空白行和 trim
    .replace(/\n{2,}/g, '\n')
    .trim()
}
