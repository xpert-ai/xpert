import {
    Layers,
    FileText,
    FolderOpen,
    ListChecks,
    Search,
    ScanSearch,
    Boxes,
    Package,
    Settings,
    ClipboardCheck,
    ShieldCheck,
    GitPullRequest,
    Code,
    TestTube,
    GitMerge,
    Calculator,
    FileCheck,
    Truck,
    type LucideIcon
} from 'lucide-react'
import type { PipelineGraph } from './bridge'

type StageIcon = NonNullable<PipelineGraph['definition']['stages'][number]['icon']>
export const pipelineStageIcons: Record<StageIcon, LucideIcon> = {
    layers: Layers,
    'file-text': FileText,
    'folder-open': FolderOpen,
    'list-checks': ListChecks,
    search: Search,
    'scan-search': ScanSearch,
    boxes: Boxes,
    package: Package,
    settings: Settings,
    'clipboard-check': ClipboardCheck,
    'shield-check': ShieldCheck,
    'git-pull-request': GitPullRequest,
    code: Code,
    'test-tube': TestTube,
    'git-merge': GitMerge,
    calculator: Calculator,
    'file-check': FileCheck,
    truck: Truck
}
