const enUS = {
    'app.title': 'Agent Evolution',
    'app.subtitle': 'Continuously discover, validate, and safely release Agent capability improvements',
    'tabs.overview': 'Overview',
    'tabs.learning': 'Learning & Proposals',
    'tabs.evaluation': 'Candidates & Evaluation',
    'tabs.release': 'Release & Runtime',
    'actions.run': 'Run full simulation',
    'actions.running': 'Running evolution…',
    'actions.refresh': 'Refresh',
    'actions.cancel': 'Cancel',
    'confirm.title': 'Run end-to-end Agent Evolution?',
    'confirm.description':
        'The isolated conformance fixture will create immutable learning evidence, replay a candidate, pass governance, run Shadow and Canary, and atomically activate a new version.',
    'empty.title': 'No evolution run yet',
    'empty.description':
        'Run the conformance scenario to exercise the complete governed lifecycle without touching production domain data.',
    'health.normal': 'System healthy',
    'health.detail': 'Registered targets are isolated and production pointers are governed.',
    'metric.targets': 'Evolution targets',
    'metric.events': 'Learning events',
    'metric.candidates': 'Candidates',
    'metric.active': 'Active releases',
    'section.targets': 'Target health',
    'section.pipeline': 'Evolution loop',
    'section.signals': 'Learning signals',
    'section.proposals': 'Proposals',
    'section.evaluations': 'Evaluation runs',
    'section.cases': 'Golden replay cases',
    'section.releases': 'Release packages',
    'section.deployments': 'Deployments',
    'section.pointer': 'Capability pointers',
    'section.audit': 'Release audit',
    'pipeline.events': 'Learning Events',
    'pipeline.proposal': 'Proposal',
    'pipeline.candidate': 'Candidate',
    'pipeline.evaluation': 'Golden Replay',
    'pipeline.release': 'Release',
    'pipeline.production': 'Production',
    'table.id': 'ID',
    'table.target': 'Target',
    'table.status': 'Status',
    'table.evidence': 'Evidence / Summary',
    'table.version': 'Version',
    'table.metric': 'Metric',
    'table.baseline': 'Baseline',
    'table.candidate': 'Candidate',
    'table.result': 'Result',
    'table.channel': 'Channel',
    'table.samples': 'Samples',
    'table.action': 'Action',
    'table.actor': 'Actor',
    'table.time': 'Time',
    'status.active': 'Active',
    'status.ready': 'Ready',
    'status.approved': 'Approved',
    'status.installed': 'Installed',
    'status.candidate_built': 'Candidate built',
    'status.packaged': 'Packaged',
    'status.passed': 'Passed',
    'status.failed': 'Failed',
    'status.shadow': 'Shadow passed',
    'status.canary': 'Canary passed',
    'status.production': 'Production',
    'status.pending_approval': 'Pending approval',
    'status.prediction_reviewed': 'Prediction reviewed',
    'status.unknown': 'Unknown',
    'result.correct': 'Correct',
    'result.regression': 'Regression',
    'result.promote': 'Promote',
    'pointer.revision': 'Revision {{revision}}',
    'simulation.complete': 'Simulation {{id}} completed; Active Pointer now references {{version}}.',
    'error.load': 'Unable to load Agent Evolution data.',
    'error.run': 'The simulation did not complete.'
} as const

type MessageKey = keyof typeof enUS
type Catalog = { [K in MessageKey]: string }

const zhHans: Catalog = {
    'app.title': '智能体进化',
    'app.subtitle': '持续发现、验证并安全发布智能体能力改进',
    'tabs.overview': '概览',
    'tabs.learning': '学习与建议',
    'tabs.evaluation': '候选与评测',
    'tabs.release': '发布与运行',
    'actions.run': '运行完整模拟',
    'actions.running': '进化执行中…',
    'actions.refresh': '刷新',
    'actions.cancel': '取消',
    'confirm.title': '运行端到端智能体进化？',
    'confirm.description':
        '隔离的契约测试将创建不可变学习证据、回放候选、通过治理、运行 Shadow 与 Canary，并原子激活新版本。',
    'empty.title': '尚无进化执行',
    'empty.description': '运行契约测试场景，在不触碰生产领域数据的情况下完整演练受治理生命周期。',
    'health.normal': '整体运行正常',
    'health.detail': '已注册目标相互隔离，生产指针受到治理。',
    'metric.targets': '进化目标',
    'metric.events': '学习事件',
    'metric.candidates': '候选',
    'metric.active': '活跃发布',
    'section.targets': '进化目标健康度',
    'section.pipeline': '进化闭环',
    'section.signals': '学习信号',
    'section.proposals': '改进建议',
    'section.evaluations': '评测执行',
    'section.cases': 'Golden Replay 样本',
    'section.releases': '发布包',
    'section.deployments': '部署',
    'section.pointer': '能力版本指针',
    'section.audit': '发布审计',
    'pipeline.events': '学习事件',
    'pipeline.proposal': 'Proposal',
    'pipeline.candidate': 'Candidate',
    'pipeline.evaluation': 'Golden Replay',
    'pipeline.release': '发布',
    'pipeline.production': '生产',
    'table.id': 'ID',
    'table.target': '目标',
    'table.status': '状态',
    'table.evidence': '证据 / 摘要',
    'table.version': '版本',
    'table.metric': '指标',
    'table.baseline': '基线',
    'table.candidate': '候选',
    'table.result': '结果',
    'table.channel': '通道',
    'table.samples': '样本',
    'table.action': '动作',
    'table.actor': '执行者',
    'table.time': '时间',
    'status.active': '活跃',
    'status.ready': '就绪',
    'status.approved': '已审批',
    'status.installed': '已安装',
    'status.candidate_built': '候选已构建',
    'status.packaged': '已打包',
    'status.passed': '通过',
    'status.failed': '失败',
    'status.shadow': 'Shadow 通过',
    'status.canary': 'Canary 通过',
    'status.production': '生产',
    'status.pending_approval': '待审批',
    'status.prediction_reviewed': '预测已复核',
    'status.unknown': '未知',
    'result.correct': '正确',
    'result.regression': '回归',
    'result.promote': '建议发布',
    'pointer.revision': '修订 {{revision}}',
    'simulation.complete': '模拟 {{id}} 已完成；Active Pointer 已指向 {{version}}。',
    'error.load': '无法加载智能体进化数据。',
    'error.run': '模拟未能完成。'
}

type SupportedLocale = 'en-US' | 'zh-Hans'
let locale: SupportedLocale = 'en-US'

export function setLocale(value?: string) {
    locale = normalizeLocale(value)
    document.documentElement.lang = locale
}

export function t(key: MessageKey, values: { [key: string]: string | number } = {}) {
    const template = (locale === 'zh-Hans' ? zhHans : enUS)[key]
    return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values[name] ?? ''))
}

export function statusLabel(status: string) {
    const key = `status.${status}`
    return isMessageKey(key) ? t(key) : t('status.unknown')
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions) {
    return new Intl.NumberFormat(locale, options).format(value)
}

export function formatDate(value: string) {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function normalizeLocale(value?: string): SupportedLocale {
    if (value === 'zh-Hans' || value === 'zh_Hans' || value === 'zh-CN' || value === 'zh-SG') return 'zh-Hans'
    return 'en-US'
}

function isMessageKey(value: string): value is MessageKey {
    return value in enUS
}
