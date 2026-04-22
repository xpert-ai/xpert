import { FileEditorSelection } from '../editor/editor.component'

export function inferTextPreviewSelection(content: string, selectedText: string): FileEditorSelection | null {
  const text = selectedText.trim()
  if (!text) {
    return null
  }

  const directMatch = buildSelectionFromIndexRange(content, text, content.indexOf(text))
  if (directMatch) {
    return directMatch
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) {
    return null
  }

  const startIndex = content.indexOf(lines[0])
  if (startIndex === -1) {
    return buildSelectionFromIndexRange(content, text, 0)
  }

  const lastLine = lines.length > 1 ? lines[lines.length - 1] : lines[0]
  const endLineSearchFrom = lines.length > 1 ? startIndex + lines[0].length : startIndex
  const endIndex = content.indexOf(lastLine, endLineSearchFrom)

  if (endIndex === -1) {
    return buildSelectionFromIndexRange(content, text, startIndex)
  }

  return buildSelectionFromIndexRange(content, text, startIndex, endIndex + lastLine.length)
}

export function toSelectionElement(node: Node | null): HTMLElement | null {
  if (!node) {
    return null
  }

  if (node instanceof HTMLElement) {
    return node
  }

  return node.parentElement
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function buildSelectionFromIndexRange(content: string, text: string, startIndex: number, endIndex?: number) {
  if (startIndex < 0) {
    return null
  }

  const normalizedEndIndex = Math.max(startIndex, endIndex ?? startIndex + text.length)
  const startLine = countLines(content.slice(0, startIndex))
  const endLine = countLines(content.slice(0, normalizedEndIndex))

  return {
    text,
    startLine,
    endLine
  }
}

function countLines(value: string) {
  return value ? value.split(/\r?\n/).length : 1
}
