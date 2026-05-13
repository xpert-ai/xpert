type MarkdownRange = {
  start: number
  end: number
}

type MarkdownFence = {
  marker: '`' | '~'
  length: number
  start: number
}

type StreamingMarkdownSplit = {
  frozenBlocks: string[]
  frozenText: string
  streaming: string
}

export function splitStreamingMarkdown(text: string): StreamingMarkdownSplit {
  const codeRanges = getFencedCodeRanges(text)
  const frozenBlocks: string[] = []
  let segmentStart = 0

  for (let index = 0; index < text.length - 1; index++) {
    if (text[index] !== '\n' || text[index + 1] !== '\n' || isSeparatorInsideRange(index, codeRanges)) {
      continue
    }

    frozenBlocks.push(text.slice(segmentStart, index))
    segmentStart = index + 2
    index++
  }

  return {
    frozenBlocks,
    frozenText: text.slice(0, segmentStart),
    streaming: text.slice(segmentStart)
  }
}

function getFencedCodeRanges(text: string): MarkdownRange[] {
  const ranges: MarkdownRange[] = []
  let fence: MarkdownFence | null = null
  let lineStart = 0

  while (lineStart < text.length) {
    const nextLineStart = getNextLineStart(text, lineStart)
    const line = text.slice(lineStart, nextLineStart)
    const lineContent = line.replace(/\r?\n$/, '')
    const marker = readFenceMarker(lineContent)

    if (!fence && marker) {
      fence = {
        ...marker,
        start: lineStart
      }
    } else if (fence && isClosingFence(lineContent, fence)) {
      ranges.push({
        start: fence.start,
        end: nextLineStart
      })
      fence = null
    }

    lineStart = nextLineStart
  }

  if (fence) {
    ranges.push({
      start: fence.start,
      end: text.length
    })
  }

  return ranges
}

function getNextLineStart(text: string, lineStart: number) {
  const nextLineBreak = text.indexOf('\n', lineStart)
  return nextLineBreak === -1 ? text.length : nextLineBreak + 1
}

function readFenceMarker(line: string): Pick<MarkdownFence, 'marker' | 'length'> | null {
  const match = /^( {0,3})(`{3,}|~{3,})/.exec(line)
  if (!match) {
    return null
  }

  const sequence = match[2]
  return {
    marker: sequence[0] === '`' ? '`' : '~',
    length: sequence.length
  }
}

function isClosingFence(line: string, fence: MarkdownFence) {
  const trimmed = line.trim()
  if (!trimmed || trimmed[0] !== fence.marker) {
    return false
  }

  let markerCount = 0
  while (trimmed[markerCount] === fence.marker) {
    markerCount++
  }

  return markerCount >= fence.length && trimmed.slice(markerCount).trim() === ''
}

function isSeparatorInsideRange(index: number, ranges: MarkdownRange[]) {
  return ranges.some((range) => index >= range.start && index + 1 < range.end)
}
