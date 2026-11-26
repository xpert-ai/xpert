function workbenchScope(service, target, ClientError) {
  const organizationId =
    target.organizationId === undefined ? (service.profile?.organizationId ?? null) : target.organizationId
  if (
    !service.credentials ||
    !service.profile?.user?.id ||
    (organizationId !== null && !service.profile.organizations?.some((org) => org.id === organizationId))
  )
    throw new ClientError('This result is unavailable. Refresh your workspace and retry.', 403)
  return {
    organizationId,
    request: organizationId === null ? { scope: 'tenant' } : { scope: 'organization', organizationId }
  }
}

module.exports = { workbenchScope }
