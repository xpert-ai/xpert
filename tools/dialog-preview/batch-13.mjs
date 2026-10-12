const confirmation = (name, title, description, action, params = {}) => ({
  name,
  source: 'packages/ui/src/lib/components/alert-dialog/alert-dialog-content.component.ts',
  width: '448px',
  title,
  description,
  action,
  params
})

export const batchThirteen = {
  roleName: {
    name: '角色名称（新建 / 重命名）',
    path: 'features/setting/roles/roles.component.html',
    fragment: 'roleNameDialog',
    width: '420px'
  },
  evolutionRerun: confirmation('重新评估候选版本', 'RerunEvaluationTitle', 'RerunEvaluationDescription', 'Rerun'),
  evolutionApprove: confirmation(
    '提交评估审批',
    'SubmitApprovalTitle',
    'SubmitApprovalDescription',
    'ConfirmApproval',
    { count: 2 }
  ),
  evolutionReject: confirmation('驳回候选版本', 'RejectCandidateTitle', 'RejectCandidateDescription', 'ConfirmReject'),
  evolutionPackage: confirmation(
    '创建发布包',
    'CreateReleasePackageTitle',
    'CreateReleasePackageDescription',
    'CreateReleasePackage'
  ),
  evolutionAdvance: confirmation('推进发布阶段', 'NextReleaseTitle', 'NextReleaseDescription', 'ConfirmReleaseAction'),
  evolutionPause: confirmation('暂停发布', 'PauseReleaseTitle', 'PauseReleaseDescription', 'PauseReleaseAction'),
  evolutionRollback: confirmation('回滚发布', 'RollbackTitle', 'RollbackDescription', 'RollbackAction', {
    from: 'candidate-v2',
    to: 'production-v1'
  }),
  evolutionTestOverride: confirmation(
    '创建灰度测试覆盖',
    'CanaryTestOverrideConfirmTitle',
    'CanaryTestOverrideConfirmDescription',
    'CreateCanaryTestOverride',
    { subjectKey: 'test-reviewer' }
  ),
  evolutionProposal: confirmation(
    '由证据生成提案',
    'GenerateProposalTitle',
    'GenerateProposalDescription',
    'CreateProposal'
  )
}
