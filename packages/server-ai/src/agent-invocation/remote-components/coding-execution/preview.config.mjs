import { defineRemoteViewPreview } from '../../../../../../tools/remote-view-preview/preview-host.mjs'
const at = '2026-10-07T04:00:00.000Z'
const contents = [
    { kind: 'message', text: '我会补充数组求和的输入校验，再验证已有行为。' },
    {
        kind: 'tool',
        name: 'Read src/sum-numbers.ts',
        status: 'succeeded',
        input: 'src/sum-numbers.ts',
        output: 'export function sumNumbers(values) { return values.reduce((a, b) => a + b, 0) }'
    },
    { kind: 'tool', name: 'Read tests/sum-numbers.test.ts', status: 'succeeded', input: 'tests/sum-numbers.test.ts' },
    { kind: 'tool', name: 'Read package.json', status: 'succeeded', input: 'package.json' },
    { kind: 'message', text: '空数组的行为已经符合要求，需要补充对无效数值的检查。' },
    {
        kind: 'tool',
        status: 'succeeded',
        detail: {
            type: 'file_change',
            files: [
                {
                    path: 'src/sum-numbers.ts',
                    change: 'modified',
                    patch: " export function sumNumbers(values) {\n+  if (!Array.isArray(values)) throw new TypeError('Expected an array')\n+  if (values.some(v => !Number.isFinite(v))) throw new TypeError('Invalid number')\n   return values.reduce((total, value) => total + value, 0)\n }"
                }
            ]
        }
    },
    {
        kind: 'tool',
        status: 'succeeded',
        detail: { type: 'file_change', files: [{ path: 'tests/sum-numbers.test.ts', change: 'modified' }] }
    },
    {
        kind: 'tool',
        name: 'Shell',
        status: 'succeeded',
        detail: {
            type: 'command',
            command: 'node --test tests/sum-numbers.test.ts',
            exitCode: 0,
            outputMode: 'merged'
        },
        output: '✔ 普通数字求和\n✔ 空数组返回 0\n✔ 支持负数与小数\n✔ 拒绝 NaN 和 Infinity\n✔ 拒绝非数字元素\n13 tests passed'
    },
    { kind: 'message', text: '测试全部通过。我会保存本次验证结果。' },
    {
        kind: 'tool',
        status: 'succeeded',
        detail: { type: 'file_change', files: [{ path: 'reports/summary.json', change: 'created' }] }
    },
    { kind: 'message', text: '已完成输入校验，13 项测试通过。空数组仍返回 0。' }
]
// Synthetic visual fixture only. Installed-platform acceptance uses real captured activity.
export default defineRemoteViewPreview({
    title: 'Coding execution · UI fixture',
    workspaceRoot: process.cwd(),
    port: 4412,
    component: {
        root: 'packages/server-ai/src/agent-invocation/remote-components/coding-execution',
        runtime: 'module'
    },
    isolatedOrigin: true,
    hostContext: {
        locale: 'zh-Hans',
        theme: { mode: 'light', tokens: {} },
        initialQuery: { selectionId: 'preview-execution' }
    },
    handleRequest(message) {
        if (message.type === 'requestData')
            return {
                data: {
                    item: {
                        execution: {
                            id: 'preview-execution',
                            provider: 'Codex',
                            tool: { id: 'Codex', version: 'preview' },
                            status: 'succeeded',
                            createdAt: at,
                            updatedAt: at,
                            result: {
                                text: contents.at(-1).text,
                                artifacts: [
                                    { id: 'preview-artifact', versionId: 'preview-version', name: 'summary.json' }
                                ]
                            }
                        },
                        activity: {
                            items: contents.map((content, i) => ({
                                id: `record-${i}`,
                                seq: i + 1,
                                firstSeq: i + 1,
                                observedAt: at,
                                content
                            })),
                            nextCursor: contents.length,
                            hasMore: false,
                            state: 'closed',
                            gaps: []
                        }
                    }
                }
            }
        throw Error('Preview fixture has no file service. Verify downloads in the installed platform.')
    }
})
