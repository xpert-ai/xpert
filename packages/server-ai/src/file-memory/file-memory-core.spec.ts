import {
    applyFileMemorySignalToUsage,
    calculateDreamCandidateScore,
    classifyDreamCandidateScore,
    createDefaultFileMemoryUsage,
    createFileMemorySignal,
    FILE_MEMORY_DREAM_SYSTEM_PROMPT,
    getXpertFileMemoryVolumeScope,
    hashFileMemoryQuery,
    parseFileMemoryMarkdown,
    renderFileMemoryMarkdown,
    resolveTopicRelativePath,
    validateFileMemoryIndex
} from './index'
import { XpertSandboxMemoryStore } from './sandbox-memory.store'

describe('FileMemory core', () => {
    it('resolves a single xpert-level memory volume scope', () => {
        expect(getXpertFileMemoryVolumeScope('tenant-1', 'xpert-1')).toEqual({
            tenantId: 'tenant-1',
            catalog: 'xperts',
            xpertId: 'xpert-1',
            isolateByUser: false
        })
    })

    it('parses and renders topic frontmatter with normalized usage', () => {
        const document = parseFileMemoryMarkdown(`---
id: mem_1
scopeType: xpert
scopeId: xpert-1
type: feedback
status: active
title: 回答风格
summary: 先给结论再给证据。
usage:
  recallCount: 2
tags:
  - style
---

## 内容

先给结论。
`)

        expect(document.frontmatter.type).toBe('feedback')
        expect(document.frontmatter.usage.recallCount).toBe(2)
        expect(document.frontmatter.usage.detailReadCount).toBe(0)

        const rendered = renderFileMemoryMarkdown(document)
        expect(rendered).toContain('type: feedback')
        expect(rendered).toContain('detailReadCount: 0')
        expect(rendered).toContain('## 内容')
    })

    it('updates usage from recall and detail signals', () => {
        const recall = createFileMemorySignal({
            type: 'recall_hit',
            xpertId: 'xpert-1',
            memoryId: 'mem-1',
            conversationId: 'conversation-1',
            queryHash: hashFileMemoryQuery('怎么回答？'),
            createdAt: '2026-05-13T10:00:00.000Z'
        })
        const detail = createFileMemorySignal({
            type: 'detail_read',
            xpertId: 'xpert-1',
            memoryId: 'mem-1',
            createdAt: '2026-05-13T10:01:00.000Z'
        })

        const afterRecall = applyFileMemorySignalToUsage(createDefaultFileMemoryUsage(), recall)
        const afterDetail = applyFileMemorySignalToUsage(afterRecall, detail)

        expect(afterDetail.recallCount).toBe(1)
        expect(afterDetail.detailReadCount).toBe(1)
        expect(afterDetail.uniqueConversationCount).toBe(1)
        expect(afterDetail.uniqueQueryCount).toBe(1)
        expect(afterDetail.usefulnessScore).toBeGreaterThan(0)
    })

    it('classifies dream candidate scores from visible signals', () => {
        const score = calculateDreamCandidateScore({
            signals: [
                createFileMemorySignal({ type: 'explicit_write', xpertId: 'xpert-1' }),
                createFileMemorySignal({ type: 'detail_read', xpertId: 'xpert-1' }),
                createFileMemorySignal({ type: 'user_correction', xpertId: 'xpert-1' }),
                createFileMemorySignal({ type: 'writeback_candidate', xpertId: 'xpert-1' }),
                createFileMemorySignal({ type: 'recall_hit', xpertId: 'xpert-1' })
            ],
            uniqueConversationCount: 6,
            uniqueQueryCount: 8,
            sourceQualityScore: 1,
            recencyScore: 1,
            actionabilityScore: 1,
            conflictScore: 1,
            coverageScore: 1
        })

        expect(score).toBeGreaterThanOrEqual(0.82)
        expect(classifyDreamCandidateScore(score)).toBe('evidence')
    })

    it('validates MEMORY.md as a navigation index', () => {
        const result = validateFileMemoryIndex(
            [
                '# Xpert Memory',
                '- [回答风格](feedback/answer-style.md) - 先给结论。',
                '- [坏链接](project/missing.md) - 不存在。',
                '- [非法目录](notes/other.md) - 不属于四类目录。',
                '## 内容',
                '- 原文正文不应该放在 index。'
            ].join('\n'),
            {
                existingPaths: ['feedback/answer-style.md', 'notes/other.md']
            }
        )

        expect(result.ok).toBe(false)
        expect(result.issues.map((issue) => issue.type)).toEqual(
            expect.arrayContaining(['missing-target', 'invalid-target', 'body-like-entry'])
        )
    })

    it('keeps dream prompt aligned with the no per-user directory design', () => {
        expect(FILE_MEMORY_DREAM_SYSTEM_PROMPT).toContain('Do not create per-user directories.')
        expect(FILE_MEMORY_DREAM_SYSTEM_PROMPT).not.toContain('private/shared')
    })

    it('resolves topic paths under the four fixed type directories', () => {
        expect(resolveTopicRelativePath('project', 'file-memory-v2')).toBe('project/file-memory-v2.md')
        expect(() => resolveTopicRelativePath('project', '../escape.md')).toThrow('Invalid file memory path')
    })

    it('normalizes sandbox glob results to memory-root-relative topic paths', async () => {
        const backend = {
            id: 'local-shell-test',
            workingDirectory: '/workspace',
            globInfo: jest.fn().mockResolvedValue([
                { path: 'profile.md', is_dir: false },
                { path: '.xpert/memory/xperts/xpert-1/user/preferences.md', is_dir: false },
                { path: 'nested', is_dir: true }
            ])
        }
        const store = new XpertSandboxMemoryStore(backend as any, 'xpert-1')

        await expect(store.listMarkdownFiles('user')).resolves.toEqual([
            'user/profile.md',
            'user/preferences.md'
        ])
        expect(backend.globInfo).toHaveBeenCalledWith('*.md', '.xpert/memory/xperts/xpert-1/user')
    })
})
