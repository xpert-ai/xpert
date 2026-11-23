import { Exclude, Expose, Type, plainToInstance } from 'class-transformer'
import type { ProjectTaskRuntimeReadService } from '../../runtime/project-task-runtime-read.service'
type Detail = Awaited<ReturnType<ProjectTaskRuntimeReadService['get']>>
type Attempt = Extract<Detail['executions'][number], { invocationRevision: number }>

@Exclude()
class ReceiptDto {
    @Expose() state: string
    @Expose() lastError?: string
}
@Exclude()
class ArtifactDto {
    @Expose() id: string
    @Expose() name?: string
    @Expose() versionId?: string
}
@Exclude()
class ReportDto {
    @Expose() status: string
    @Expose() sha256?: string
    @Expose() path?: string
    @Expose() code?: string
}
@Exclude()
class ExportDto {
    @Expose() mode: string
    @Expose() status: string
    @Expose() error?: string
}
@Exclude()
class ResultDto {
    @Expose() hasText: boolean
    @Expose() textTruncated?: boolean
    @Expose() @Type(() => ReportDto) report?: ReportDto
    @Expose() @Type(() => ExportDto) export?: ExportDto
    @Expose() @Type(() => ArtifactDto) artifacts?: ArtifactDto[]
}
@Exclude()
class SpecificationDto {
    @Expose() digest: string
}
@Exclude()
class ReviewReportDto {
    @Expose() format: 'markdown'
    @Expose() markdown: string
}
@Exclude()
export class ProjectTaskExecutionDetailDto {
    @Expose() outputSummary?: string
    @Expose() id: string
    @Expose() attempt: number
    @Expose() invocationId?: string
    @Expose() invocationStatus?: Attempt['invocationStatus']
    @Expose() invocationRevision?: number
    @Expose() runtimeProvider?: string
    @Expose() runtimeToolId?: string
    @Expose() purpose?: Attempt['purpose']
    @Expose() progress?: Attempt['progress']
    @Expose() executionBudget?: Attempt['executionBudget']
    @Expose() observedAt?: string
    @Expose() evidence?: Attempt['evidence']
    @Expose() @Type(() => ReviewReportDto) reviewReport?: ReviewReportDto
    @Expose() @Type(() => ReceiptDto) delivery?: ReceiptDto[]
    @Expose() @Type(() => ReceiptDto) consumption?: ReceiptDto[]
    @Expose() @Type(() => ResultDto) result?: ResultDto
    @Expose() error?: string
    @Expose() observation?: string
}
@Exclude()
export class ProjectTaskDetailDto {
    @Expose() id: string
    @Expose() title?: string
    @Expose() description?: string
    @Expose() revision: number
    @Expose() status: string
    @Expose() requirements?: string[]
    @Expose() decisionOptions: Detail['decisionOptions']
    @Expose() @Type(() => SpecificationDto) specificationSnapshot?: SpecificationDto
    @Expose() @Type(() => ProjectTaskExecutionDetailDto) executions: ProjectTaskExecutionDetailDto[]
}
export function taskDetailDto(detail: Detail) {
    return plainToInstance(
        ProjectTaskDetailDto,
        {
            ...detail,
            executions: detail.executions.map((attempt) => ({
                ...attempt,
                ...('result' in attempt && attempt.result
                    ? { result: { ...attempt.result, hasText: Boolean(attempt.result.text) } }
                    : {})
            }))
        },
        { excludeExtraneousValues: true }
    )
}

@Exclude()
class ProjectTaskArtifactExecutionDto {
    @Expose() id: string
    @Expose() attempt: number
    @Expose() invocationId?: string
    @Expose() runtimeProvider?: string
    @Expose() runtimeToolId?: string
    @Expose() observation?: string
    @Expose() @Type(() => ResultDto) result?: ResultDto
}
@Exclude()
class ProjectTaskArtifactsDto {
    @Expose() id: string
    @Expose() revision: number
    @Expose() status: string
    @Expose() @Type(() => ProjectTaskArtifactExecutionDto) executions: ProjectTaskArtifactExecutionDto[]
}
export function taskArtifactsDto(detail: Detail) {
    return plainToInstance(ProjectTaskArtifactsDto, detail, { excludeExtraneousValues: true })
}
