import { writeMemoryFileAtomically } from './write-memory-file'
import { FileMemoryConsolidation } from './dream-consolidation'
import { runWithIndependentWorkspaceLeases, withWorkspaceLock } from '../../shared/volume/workspace-storage-lock'
import { createPassingGateResult, isRecordChangedSince, countSignalConversationsSince } from './dream-gate'
import { mergeDreamConflicts } from './dream-report'
import { Injectable, Logger } from '@nestjs/common'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { FileMemoryService } from './file-memory.service'
import {
    FileMemoryConversationHistoryReader,
    FileMemoryDreamModel,
    createFileMemoryScopeKey,
    FileMemoryXpertScope
} from './ports'
import { FILE_MEMORY_DREAM_SYSTEM_PROMPT } from './dream-prompt'
import { parseFileMemoryMarkdown } from './frontmatter'
import { validateFileMemoryIndex } from './index-validator'
import { readRecentSignals, readSessionEvidence } from './dream-evidence'
import {
    FILE_MEMORY_DREAM_DIR,
    FILE_MEMORY_INDEX_FILENAME,
    FILE_MEMORY_TYPES,
    FileMemoryDreamConfig,
    FileMemoryDreamGateConfig,
    FileMemoryDreamGateResult,
    FileMemoryDreamRequest,
    FileMemoryDreamRunDetail,
    FileMemoryDreamRunReport,
    FileMemoryDreamRunStatus,
    FileMemoryDreamRunSummary,
    FileMemoryScorecardIndex,
    FileMemorySignal
} from './types'

type DreamSlot = {
    current?: Promise<void>
    pending?: Promise<FileMemoryDreamRunSummary>
}

type DreamValidationResult = {
    ok: boolean
    status: 'succeeded' | 'partial' | 'skipped'
    issues: Array<{
        type: string
        message: string
        path?: string
        line?: number
    }>
}

const DREAMS_FILENAME = 'DREAMS.md'
const DREAM_CONFIG_FILENAME = 'config.json'
const DEFAULT_DREAM_GATE_CONFIG: FileMemoryDreamGateConfig = {
    enabled: true,
    minIntervalMinutes: 30,
    minNewOrUpdatedMemories: 1,
    minConversationCount: 1
}

@Injectable()
export class FileMemoryDreamService {
    private readonly logger = new Logger(FileMemoryDreamService.name)
    private readonly slots = new Map<string, DreamSlot>()

    constructor(
        private readonly fileMemoryService: FileMemoryService,
        private readonly consolidation: FileMemoryConsolidation,
        private readonly conversationHistoryReader: FileMemoryConversationHistoryReader,
        private readonly runtime: FileMemoryDreamModel
    ) {}

    async triggerDream(xpert: FileMemoryXpertScope, request: FileMemoryDreamRequest = {}) {
        const key = createFileMemoryScopeKey(xpert)
        const slot: DreamSlot = this.slots.get(key) ?? {}
        if (slot.pending) return { ...(await slot.pending), coalesced: true }
        const previous = slot.current
        const pending = this.createRun(xpert, request)
        slot.pending = pending
        this.slots.set(key, slot)
        // Register synchronously. Each continuation retains the triggering request's scope.
        const current = pending
            .then(async (run) => {
                await previous
                slot.pending = undefined
                try {
                    await runWithIndependentWorkspaceLeases(() =>
                        this.runtime.withActor(xpert, () => this.runDream(xpert, run))
                    )
                } catch (error) {
                    await this.finishRun(xpert, run, 'failed', error instanceof Error ? error.message : String(error))
                }
            })
            .catch((error) => this.logger.error('Dream queue failed', error))
            .finally(() => {
                if (slot.current === current) this.slots.delete(key)
            })
        slot.current = current
        return pending
    }

    async listRuns(xpert: FileMemoryXpertScope) {
        const root = await this.fileMemoryService.getMemoryRootPath(xpert)
        const runsRoot = path.join(root, FILE_MEMORY_DREAM_DIR, 'runs')
        const entries = await fsPromises.readdir(runsRoot, { withFileTypes: true }).catch(() => [])
        const runs = await Promise.all(
            entries
                .filter((entry) => entry.isDirectory())
                .map(async (entry) => this.readRunStatus(xpert, entry.name).catch(() => null))
        )
        return runs
            .filter((run): run is FileMemoryDreamRunSummary => Boolean(run))
            .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
    }

    async getRun(xpert: FileMemoryXpertScope, runId: string) {
        return this.getRunDetail(xpert, runId)
    }

    async getDreamConfig(
        xpert: FileMemoryXpertScope
    ): Promise<FileMemoryDreamConfig & { defaults: FileMemoryDreamConfig }> {
        const saved = await this.readManagedJson<FileMemoryDreamConfig>(xpert, DREAM_CONFIG_FILENAME).catch(
            () => undefined
        )
        return {
            gate: saved?.gate,
            defaults: this.getEnvDreamConfig()
        }
    }

    async saveDreamConfig(xpert: FileMemoryXpertScope, config: FileMemoryDreamConfig) {
        const normalized: FileMemoryDreamConfig = {
            gate: normalizeDreamGateConfig(config.gate)
        }
        await this.writeJson(await this.getDreamPath(xpert, DREAM_CONFIG_FILENAME), normalized)
        return this.getDreamConfig(xpert)
    }

    async cancelRun(xpert: FileMemoryXpertScope, runId: string) {
        const run = await this.readRunStatus(xpert, runId)
        if (run.status !== 'queued') {
            return run
        }
        const cancelled = {
            ...run,
            status: 'cancelled' as FileMemoryDreamRunStatus,
            finishedAt: new Date().toISOString()
        }
        await this.writeRunStatus(xpert, runId, cancelled)
        return cancelled
    }

    private async createRun(xpert: FileMemoryXpertScope, request: FileMemoryDreamRequest) {
        const requestedAt = new Date().toISOString()
        const run: FileMemoryDreamRunSummary = {
            runId: `dream_${randomUUID()}`,
            xpertId: xpert.id,
            tenantId: xpert.tenantId,
            status: 'queued',
            reason: request.reason ?? 'manual',
            requestedAt
        }
        const runRoot = await this.getRunRoot(xpert, run.runId)
        await fsPromises.mkdir(path.join(runRoot, 'evidence'), { recursive: true })
        await fsPromises.mkdir(path.join(runRoot, 'output'), { recursive: true })
        await this.writeJson(path.join(runRoot, 'request.json'), {
            ...request,
            reason: run.reason,
            userId: xpert.userId,
            organizationId: xpert.organizationId,
            projectId: xpert.projectId,
            requestedAt
        })
        await this.writeRunStatus(xpert, run.runId, run)
        return run
    }

    private async runDream(xpert: FileMemoryXpertScope, run: FileMemoryDreamRunSummary) {
        const latest = await this.readRunStatus(xpert, run.runId).catch(() => run)
        if (latest.status === 'cancelled') {
            return
        }

        const startedAt = new Date().toISOString()
        await this.writeRunStatus(xpert, run.runId, {
            ...latest,
            status: 'running',
            startedAt
        })

        try {
            const maintenancePath = await this.getDreamPath(xpert, 'maintenance')
            await withWorkspaceLock(
                maintenancePath,
                async () => {
                    const lockAcquired = await this.acquireLock(xpert, run.runId)
                    if (!lockAcquired) {
                        await this.finishRun(
                            xpert,
                            run,
                            'partial',
                            'Another dream run is already active for this Xpert.'
                        )
                        return
                    }

                    try {
                        const gate = await this.evaluateDreamGate(xpert, run)
                        if (!gate.passed) {
                            await this.skipRunByGate(xpert, run, gate, startedAt)
                            return
                        }
                        await this.writeJson(await this.getOutputPath(xpert, run.runId, 'gate.json'), gate)
                        const evidence = await this.writeEvidenceFiles(xpert, run.runId)
                        await this.writePreflightReport(xpert, run.runId, evidence)
                        const result = await this.consolidation.run(
                            xpert,
                            run.runId,
                            evidence.records,
                            evidence.sessionSnippets,
                            evidence.signals
                        )
                        const validation = await this.validateMemoryRoot(xpert)
                        const unresolvedConflicts = mergeDreamConflicts(
                            result.unresolvedConflicts,
                            validation.issues.map((issue) => ({ path: issue.path, reason: issue.message }))
                        )
                        const changedFiles = result.changedFiles
                        const status = unresolvedConflicts.length ? 'partial' : 'succeeded'
                        const report: FileMemoryDreamRunReport = {
                            runId: run.runId,
                            xpertId: xpert.id,
                            status,
                            model: result.model,
                            changedFiles,
                            unresolvedConflicts,
                            dreamDiary: `本次整理修改了 ${changedFiles.length} 条笔记，${unresolvedConflicts.length} 项待确认。`
                        }
                        await this.writeJson(await this.getOutputPath(xpert, run.runId, 'dream-report.json'), report)
                        await this.writeJson(await this.getOutputPath(xpert, run.runId, 'validation.json'), validation)
                        await this.writeJson(
                            await this.getOutputPath(xpert, run.runId, 'changed-files.json'),
                            changedFiles
                        )
                        await this.appendDreamDiary(xpert, report)
                        await this.writeRunStatus(xpert, run.runId, {
                            ...run,
                            status,
                            startedAt,
                            finishedAt: new Date().toISOString(),
                            changedFileCount: changedFiles.length,
                            unresolvedConflictCount: report.unresolvedConflicts.length,
                            gate
                        })
                    } finally {
                        await this.releaseLock(xpert, run.runId)
                    }
                },
                5000
            )
        } catch (error) {
            this.logger.warn(
                `File memory dream failed for ${xpert.id}/${run.runId}: ${error instanceof Error ? error.message : String(error)}`
            )
            await this.finishRun(
                xpert,
                run,
                'failed',
                error instanceof Error ? error.message : String(error),
                startedAt
            )
        }
    }

    private async finishRun(
        xpert: FileMemoryXpertScope,
        run: FileMemoryDreamRunSummary,
        status: FileMemoryDreamRunStatus,
        error?: string,
        startedAt?: string
    ) {
        await this.writeRunStatus(xpert, run.runId, {
            ...run,
            status,
            startedAt: startedAt ?? run.startedAt,
            finishedAt: new Date().toISOString(),
            error
        })
    }

    private async evaluateDreamGate(
        xpert: FileMemoryXpertScope,
        run: FileMemoryDreamRunSummary
    ): Promise<FileMemoryDreamGateResult> {
        const config = this.resolveDreamGateConfig(await this.getDreamConfig(xpert))
        const previousRun = await this.findPreviousEffectiveDreamRun(xpert, run.runId)
        if (!config.enabled) {
            return createPassingGateResult(config, ['Dream gate is disabled.'], previousRun)
        }
        const since = previousRun?.finishedAt ?? previousRun?.startedAt ?? previousRun?.requestedAt
        if (!since) {
            return createPassingGateResult(config, ['No previous completed Dream run.'], previousRun)
        }

        const now = new Date()
        const sinceTime = Date.parse(since)
        const elapsedMinutes = Number.isFinite(sinceTime)
            ? Math.max(0, Math.floor((now.getTime() - sinceTime) / 60_000))
            : undefined
        const root = await this.fileMemoryService.getMemoryRootPath(xpert)
        const [records, signals] = await Promise.all([
            this.fileMemoryService.listTopicRecords(xpert),
            readRecentSignals(root)
        ])
        const newOrUpdatedMemoryCount = records.filter((record) => isRecordChangedSince(record, since)).length
        const conversationCount = countSignalConversationsSince(signals, since)
        const reasons: string[] = []

        if (elapsedMinutes !== undefined && elapsedMinutes < config.minIntervalMinutes) {
            reasons.push(
                `Need at least ${config.minIntervalMinutes} minute(s) between Dream runs; only ${elapsedMinutes} minute(s) elapsed.`
            )
        }
        if (newOrUpdatedMemoryCount < config.minNewOrUpdatedMemories) {
            reasons.push(
                `Need at least ${config.minNewOrUpdatedMemories} new or updated memory file(s); found ${newOrUpdatedMemoryCount}.`
            )
        }
        if (conversationCount < config.minConversationCount) {
            reasons.push(
                `Need at least ${config.minConversationCount} conversation(s) with memory signals; found ${conversationCount}.`
            )
        }

        return {
            passed: reasons.length === 0,
            lastRunId: previousRun?.runId,
            lastFinishedAt: previousRun?.finishedAt,
            checkedSince: since,
            newOrUpdatedMemoryCount,
            conversationCount,
            elapsedMinutes,
            config,
            reasons: reasons.length ? reasons : ['Dream gate passed.']
        }
    }

    private async findPreviousEffectiveDreamRun(xpert: FileMemoryXpertScope, currentRunId: string) {
        const runs = await this.listRuns(xpert)
        return runs
            .filter(
                (item) =>
                    item.runId !== currentRunId &&
                    (item.status === 'succeeded' || item.status === 'partial') &&
                    Boolean(item.finishedAt ?? item.startedAt ?? item.requestedAt)
            )
            .sort((a, b) =>
                (b.finishedAt ?? b.startedAt ?? b.requestedAt).localeCompare(
                    a.finishedAt ?? a.startedAt ?? a.requestedAt
                )
            )[0]
    }

    private async skipRunByGate(
        xpert: FileMemoryXpertScope,
        run: FileMemoryDreamRunSummary,
        gate: FileMemoryDreamGateResult,
        startedAt: string
    ) {
        const validation: DreamValidationResult = {
            ok: true,
            status: 'skipped',
            issues: []
        }
        const report: FileMemoryDreamRunReport = {
            runId: run.runId,
            xpertId: xpert.id,
            status: 'skipped',
            changedFiles: [],
            unresolvedConflicts: [],
            dreamDiary: `Dream skipped because the gate did not pass: ${gate.reasons.join('; ')}.`
        }
        await this.writeJson(await this.getOutputPath(xpert, run.runId, 'gate.json'), gate)
        await this.writeJson(await this.getOutputPath(xpert, run.runId, 'validation.json'), validation)
        await this.writeJson(await this.getOutputPath(xpert, run.runId, 'changed-files.json'), [])
        await this.writeJson(await this.getOutputPath(xpert, run.runId, 'dream-report.json'), report)
        await this.writeRunStatus(xpert, run.runId, {
            ...run,
            status: 'skipped',
            startedAt,
            finishedAt: new Date().toISOString(),
            changedFileCount: 0,
            unresolvedConflictCount: 0,
            gate
        })
        this.logger.log(
            `File memory dream skipped for ${xpert.id}/${run.runId}: newMemories=${gate.newOrUpdatedMemoryCount} conversations=${gate.conversationCount} elapsedMinutes=${gate.elapsedMinutes ?? '-'} reasons=${gate.reasons.join('; ')}`
        )
    }

    private async acquireLock(xpert: FileMemoryXpertScope, runId: string) {
        const lockPath = await this.getDreamPath(xpert, 'locks/dream.json')
        await fsPromises.mkdir(path.dirname(lockPath), { recursive: true })
        const existing = await this.readJson<{ runId?: string; acquiredAt?: string }>(lockPath).catch(() => null)
        if (existing?.runId && existing.runId !== runId) {
            return false
        }
        await this.writeJson(lockPath, {
            runId,
            acquiredAt: new Date().toISOString()
        })
        return true
    }

    private async releaseLock(xpert: FileMemoryXpertScope, runId: string) {
        const lockPath = await this.getDreamPath(xpert, 'locks/dream.json')
        const existing = await this.readJson<{ runId?: string }>(lockPath).catch(() => null)
        if (existing?.runId === runId) {
            await fsPromises.rm(lockPath, { force: true })
        }
    }

    private async writeEvidenceFiles(xpert: FileMemoryXpertScope, runId: string) {
        const root = await this.fileMemoryService.getMemoryRootPath(xpert)
        const records = await this.fileMemoryService.listTopicRecords(xpert)
        const signals = await readRecentSignals(root)
        const scorecards = await this.readJson<FileMemoryScorecardIndex>(
            path.join(root, FILE_MEMORY_DREAM_DIR, 'scorecards', 'index.json')
        ).catch(() => null)
        const indexContent = await fsPromises
            .readFile(path.join(root, FILE_MEMORY_INDEX_FILENAME), 'utf8')
            .catch(() => '')
        const validation = validateFileMemoryIndex(indexContent, {
            existingPaths: records.map((record) => record.relativePath),
            archivedPaths: records
                .filter((record) => record.document.frontmatter.status === 'archived')
                .map((record) => record.relativePath)
        })

        const manifest = {
            xpertId: xpert.id,
            generatedAt: new Date().toISOString(),
            index: {
                path: FILE_MEMORY_INDEX_FILENAME,
                exists: Boolean(indexContent),
                validation
            },
            topics: records.map((record) => ({
                path: record.relativePath,
                frontmatter: record.document.frontmatter,
                bodyBytes: Buffer.byteLength(record.document.body, 'utf8')
            }))
        }

        const runRoot = await this.getRunRoot(xpert, runId)
        const sessionSnippets = await readSessionEvidence(this.conversationHistoryReader, xpert, signals, records)
        await this.writeJson(path.join(runRoot, 'evidence', 'memory-manifest.json'), manifest)
        await this.writeJson(path.join(runRoot, 'evidence', 'signals.json'), {
            generatedAt: new Date().toISOString(),
            signals
        })
        await this.writeJson(path.join(runRoot, 'evidence', 'scorecards.json'), {
            generatedAt: new Date().toISOString(),
            scorecards
        })
        await fsPromises.writeFile(
            path.join(runRoot, 'evidence', 'session-snippets.jsonl'),
            sessionSnippets.map((snippet) => JSON.stringify(snippet)).join('\n') + (sessionSnippets.length ? '\n' : ''),
            'utf8'
        )
        await fsPromises.writeFile(
            path.join(runRoot, 'evidence', 'instructions.md'),
            FILE_MEMORY_DREAM_SYSTEM_PROMPT,
            'utf8'
        )

        return {
            records,
            manifest,
            signals,
            scorecards,
            sessionSnippets,
            validation
        }
    }

    private async writePreflightReport(
        xpert: FileMemoryXpertScope,
        runId: string,
        evidence: {
            manifest: { topics: unknown[] }
            signals: FileMemorySignal[]
            sessionSnippets: unknown[]
            validation: { issues: unknown[] }
        }
    ) {
        const content = [
            `# FileMemory Dream Preflight`,
            ``,
            `- Run: ${runId}`,
            `- Xpert: ${xpert.id}`,
            `- Topics scanned: ${evidence.manifest.topics.length}`,
            `- Signals loaded: ${evidence.signals.length}`,
            `- Session snippets loaded: ${evidence.sessionSnippets.length}`,
            `- Index issues: ${evidence.validation.issues.length}`,
            ``,
            `Evidence snapshot prepared for model review.`
        ].join('\n')
        await fsPromises.writeFile(
            await this.getOutputPath(xpert, runId, 'preflight-report.md'),
            `${content}\n`,
            'utf8'
        )
    }

    private async validateMemoryRoot(xpert: FileMemoryXpertScope): Promise<DreamValidationResult> {
        const root = await this.fileMemoryService.getMemoryRootPath(xpert)
        const records = await this.fileMemoryService.listTopicRecords(xpert)
        const issues: DreamValidationResult['issues'] = []
        const seenTitles = new Map<string, string>()

        for (const record of records) {
            const { frontmatter } = record.document
            if (frontmatter.scopeType !== 'xpert' || frontmatter.scopeId !== xpert.id) {
                issues.push({
                    type: 'invalid-frontmatter-scope',
                    path: record.relativePath,
                    message: 'Topic frontmatter scope must match the current Xpert.'
                })
            }
            const titleKey = frontmatter.title.trim().toLowerCase()
            const existing = seenTitles.get(titleKey)
            if (existing) {
                issues.push({
                    type: 'duplicate-title',
                    path: record.relativePath,
                    message: `Duplicate topic title also used by ${existing}.`
                })
            } else {
                seenTitles.set(titleKey, record.relativePath)
            }
        }

        const malformedTopics = await this.findMalformedTopicFiles(root)
        issues.push(...malformedTopics)

        const indexContent = await fsPromises
            .readFile(path.join(root, FILE_MEMORY_INDEX_FILENAME), 'utf8')
            .catch(() => '')
        const indexValidation = validateFileMemoryIndex(indexContent, {
            existingPaths: records.map((record) => record.relativePath),
            archivedPaths: records
                .filter((record) => record.document.frontmatter.status === 'archived')
                .map((record) => record.relativePath)
        })
        issues.push(
            ...indexValidation.issues.map((issue) => ({
                type: `index:${issue.type}`,
                path: issue.target ?? FILE_MEMORY_INDEX_FILENAME,
                line: issue.line,
                message: issue.message
            }))
        )

        return {
            ok: issues.length === 0,
            status: issues.length === 0 ? 'succeeded' : 'partial',
            issues
        }
    }

    private async appendDreamDiary(xpert: FileMemoryXpertScope, report: FileMemoryDreamRunReport) {
        const dreamsPath = await this.getDreamPath(xpert, DREAMS_FILENAME)
        await fsPromises.mkdir(path.dirname(dreamsPath), { recursive: true })
        const entry = [
            `## ${new Date().toISOString()} ${report.runId}`,
            ``,
            report.dreamDiary,
            ``,
            `Status: ${report.status}`,
            `Changed files: ${report.changedFiles.length}`,
            `Unresolved conflicts: ${report.unresolvedConflicts.length}`,
            ``
        ].join('\n')
        await fsPromises.appendFile(dreamsPath, entry, 'utf8')
    }

    private async findMalformedTopicFiles(root: string): Promise<DreamValidationResult['issues']> {
        const issues: DreamValidationResult['issues'] = []
        for (const type of FILE_MEMORY_TYPES) {
            const dir = path.join(root, type)
            const entries = await fsPromises.readdir(dir, { withFileTypes: true }).catch(() => [])
            for (const entry of entries) {
                if (!entry.isFile() || !entry.name.endsWith('.md')) {
                    continue
                }
                const relativePath = path.posix.join(type, entry.name)
                const fullPath = path.join(dir, entry.name)
                try {
                    parseFileMemoryMarkdown(await fsPromises.readFile(fullPath, 'utf8'))
                } catch (error) {
                    issues.push({
                        type: 'malformed-topic',
                        path: relativePath,
                        message: error instanceof Error ? error.message : String(error)
                    })
                }
            }
        }
        return issues
    }

    private async getRunDetail(xpert: FileMemoryXpertScope, runId: string): Promise<FileMemoryDreamRunDetail> {
        const summary = await this.readRunStatus(xpert, runId)
        const relative = `runs/${runId}/output/`
        const [preflight, report, validation] = await Promise.all([
            this.fileMemoryService
                .readManagedSnapshot(xpert, FILE_MEMORY_DREAM_DIR + '/' + relative + 'preflight-report.md')
                .catch(() => undefined),
            this.readManagedJson<FileMemoryDreamRunReport>(xpert, relative + 'dream-report.json').catch(
                () => undefined
            ),
            this.readManagedJson<FileMemoryDreamRunDetail['validation']>(xpert, relative + 'validation.json').catch(
                () => undefined
            )
        ])

        return {
            summary: {
                ...summary,
                changedFileCount: summary.changedFileCount ?? report?.changedFiles.length,
                unresolvedConflictCount: summary.unresolvedConflictCount ?? report?.unresolvedConflicts.length
            },
            preflight,
            report,
            validation,
            artifacts: await this.listRunArtifacts(xpert, runId)
        }
    }

    private async listRunArtifacts(xpert: FileMemoryXpertScope, runId: string) {
        const relativePaths = [
            ['status', 'Status', `runs/${runId}/status.json`, 'json'],
            ['request', 'Request', `runs/${runId}/request.json`, 'json'],
            ['evidence', 'Evidence', `runs/${runId}/evidence`, 'directory'],
            ['preflight', 'Preflight', `runs/${runId}/output/preflight-report.md`, 'markdown'],
            ['gate', 'Gate', `runs/${runId}/output/gate.json`, 'json'],
            ['dream_report', 'Dream report', `runs/${runId}/output/dream-report.json`, 'json'],
            ['validation', 'Validation', `runs/${runId}/output/validation.json`, 'json'],
            ['changed_files', 'Changed files', `runs/${runId}/output/changed-files.json`, 'json']
        ] as const

        return Promise.all(
            relativePaths.map(async ([id, label, artifactPath, kind]) => {
                const fullPath = await this.getDreamPath(xpert, artifactPath)
                return {
                    id,
                    label,
                    path: `${FILE_MEMORY_DREAM_DIR}/${artifactPath}`,
                    kind,
                    exists: await pathExists(fullPath)
                }
            })
        )
    }

    private async readManagedJson<T>(scope: FileMemoryXpertScope, relative: string): Promise<T> {
        return JSON.parse(
            await this.fileMemoryService.readManagedSnapshot(scope, FILE_MEMORY_DREAM_DIR + '/' + relative)
        )
    }

    private async readRunStatus(xpert: FileMemoryXpertScope, runId: string) {
        if (!/^dream_[a-zA-Z0-9_-]{1,90}$/.test(runId)) throw new Error('Invalid Dream run ID')
        return this.readManagedJson<FileMemoryDreamRunSummary>(xpert, `runs/${runId}/status.json`)
    }

    private async writeRunStatus(xpert: FileMemoryXpertScope, runId: string, status: FileMemoryDreamRunSummary) {
        await this.writeJson(path.join(await this.getRunRoot(xpert, runId), 'status.json'), status)
    }

    private async getOutputPath(xpert: FileMemoryXpertScope, runId: string, fileName: string) {
        return path.join(await this.getRunRoot(xpert, runId), 'output', fileName)
    }

    private async getRunRoot(xpert: FileMemoryXpertScope, runId: string) {
        if (!/^dream_[a-zA-Z0-9_-]{1,90}$/.test(runId)) throw new Error('Invalid Dream run ID')
        return path.join(await this.fileMemoryService.getMemoryRootPath(xpert), FILE_MEMORY_DREAM_DIR, 'runs', runId)
    }

    private async getDreamPath(xpert: FileMemoryXpertScope, relativePath: string) {
        return path.join(await this.fileMemoryService.getMemoryRootPath(xpert), FILE_MEMORY_DREAM_DIR, relativePath)
    }

    private resolveDreamGateConfig(config: FileMemoryDreamConfig & { defaults?: FileMemoryDreamConfig }) {
        return {
            ...DEFAULT_DREAM_GATE_CONFIG,
            ...config.defaults?.gate,
            ...config.gate
        }
    }

    private getEnvDreamConfig(): FileMemoryDreamConfig {
        return {
            gate: getEnvDreamGateConfig()
        }
    }

    private async readJson<T>(filePath: string) {
        return JSON.parse(await fsPromises.readFile(filePath, 'utf8')) as T
    }

    private async writeJson(filePath: string, value: unknown) {
        await writeMemoryFileAtomically(filePath, `${JSON.stringify(value, null, 2)}\n`)
    }
}

function normalizeDreamGateConfig(value?: Partial<FileMemoryDreamGateConfig> | null) {
    if (!value || typeof value !== 'object') {
        return undefined
    }
    return compactUndefined({
        enabled: normalizeBoolean(value.enabled),
        minIntervalMinutes: normalizeNonNegativeInteger(value.minIntervalMinutes),
        minNewOrUpdatedMemories: normalizeNonNegativeInteger(value.minNewOrUpdatedMemories),
        minConversationCount: normalizeNonNegativeInteger(value.minConversationCount)
    })
}

function getEnvDreamGateConfig(): Partial<FileMemoryDreamGateConfig> {
    return compactUndefined({
        enabled: normalizeBoolean(process.env.FILE_MEMORY_DREAM_GATE_ENABLED),
        minIntervalMinutes: normalizeNonNegativeInteger(process.env.FILE_MEMORY_DREAM_MIN_INTERVAL_MINUTES),
        minNewOrUpdatedMemories: normalizeNonNegativeInteger(process.env.FILE_MEMORY_DREAM_MIN_NEW_MEMORIES),
        minConversationCount: normalizeNonNegativeInteger(process.env.FILE_MEMORY_DREAM_MIN_CONVERSATIONS)
    })
}

function normalizeBoolean(value: unknown) {
    if (typeof value === 'boolean') {
        return value
    }
    if (typeof value === 'string') {
        if (['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase())) {
            return true
        }
        if (['false', '0', 'no', 'off'].includes(value.trim().toLowerCase())) {
            return false
        }
    }
    return undefined
}

function normalizeNonNegativeInteger(value: unknown) {
    const parsed =
        typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
    if (!Number.isFinite(parsed)) {
        return undefined
    }
    return Math.max(0, Math.floor(parsed))
}

function compactUndefined<T extends Record<string, unknown>>(value: T) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>
}

async function pathExists(filePath: string) {
    try {
        await fsPromises.access(filePath)
        return true
    } catch {
        return false
    }
}
