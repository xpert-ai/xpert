import { z } from 'zod/v3'
import { FileText } from 'lucide-react'
import { Button } from '@xpert-ai/shadcn-ui'

// Only committed artifacts are files. Result prose and declared paths are not download grants.
export const outputResultSchema = z.object({
    text: z.string(),
    artifacts: z
        .array(z.object({ id: z.string(), name: z.string().optional(), versionId: z.string().optional() }))
        .optional(),
    export: z
        .object({
            mode: z.enum(['none', 'files', 'archive']),
            status: z.enum(['not_requested', 'completed', 'failed', 'unavailable']),
            error: z.string().optional()
        })
        .optional()
})

type OutputAttempt = {
    id: string
    attempt: number
    invocationId?: string | null
    runtimeProvider?: string
    observation?: string
    result?: z.output<typeof outputResultSchema> | null
}

export function RuntimeOutputs({
    executions,
    error,
    locale,
    openAttempt
}: {
    executions?: OutputAttempt[]
    error: string
    locale: string
    openAttempt: (id: string) => void
}) {
    const zh = locale.startsWith('zh')
    const label = (en: string, cn: string) => (zh ? cn : en)
    return (
        <section className="space-y-4 border-t pt-4" aria-label={label('Delivered files', '交付文件')}>
            {error && (
                <p role="alert" className="break-words text-sm text-destructive">
                    {error}
                </p>
            )}
            {!executions && !error && (
                <p role="status" className="text-sm text-muted-foreground">
                    {label('Loading files…', '正在读取交付文件…')}
                </p>
            )}
            {executions
                ?.filter((attempt) => attempt.invocationId)
                .map((attempt) => {
                    const files = attempt.result?.artifacts ?? []
                    const delivery = attempt.result?.export
                    const failed = delivery?.status === 'failed' || delivery?.status === 'unavailable'
                    return (
                        <section key={attempt.id} className="space-y-2 border-b pb-4 last:border-b-0">
                            <h3 className="text-sm font-medium">
                                #{attempt.attempt} · {attempt.runtimeProvider}
                            </h3>
                            {attempt.observation === 'restricted' ? (
                                <p className="text-sm text-muted-foreground">
                                    {label('File access is restricted.', '此运行的产物访问受限。')}
                                </p>
                            ) : (
                                <>
                                    {failed && (
                                        <div role="status" className="space-y-1 text-sm text-destructive">
                                            <p>{label('File delivery failed', '文件交付失败')}</p>
                                            {delivery.error && (
                                                <p className="whitespace-pre-wrap break-words">{delivery.error}</p>
                                            )}
                                        </div>
                                    )}
                                    {files.length > 0 ? (
                                        <ul className="space-y-2">
                                            {files.map((file) => (
                                                <li
                                                    key={`${file.id}:${file.versionId ?? ''}`}
                                                    className="flex items-start gap-2 text-sm"
                                                >
                                                    <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                                                    <span className="min-w-0 break-words">
                                                        {file.name ?? label('File', '文件')}
                                                        {!file.versionId && (
                                                            <span className="ml-2 text-xs text-muted-foreground">
                                                                {label('No downloadable version', '无可下载版本')}
                                                            </span>
                                                        )}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            {delivery?.status === 'not_requested'
                                                ? label(
                                                      'No file delivery was requested for this execution.',
                                                      '本次执行未要求交付文件。'
                                                  )
                                                : label('No files have been delivered.', '尚无已交付文件。')}
                                        </p>
                                    )}
                                    {failed && (
                                        <p className="text-xs text-muted-foreground">
                                            {label(
                                                'Files in the working directory are not downloadable artifacts until delivery succeeds.',
                                                '工作目录中的文件需成功交付后，才会成为可下载产物。'
                                            )}
                                        </p>
                                    )}
                                    <Button size="sm" variant="outline" onClick={() => openAttempt(attempt.id)}>
                                        {files.length
                                            ? label('View execution & download', '查看执行与下载')
                                            : label('View execution', '查看执行过程')}
                                    </Button>
                                </>
                            )}
                        </section>
                    )
                })}
            {executions && !executions.some((attempt) => attempt.invocationId) && (
                <p className="text-sm text-muted-foreground">
                    {label('No files have been delivered.', '尚无已交付文件。')}
                </p>
            )}
        </section>
    )
}
