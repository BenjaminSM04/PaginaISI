export function visibleApplicationsQueryKey(roles?: readonly string[]) {
  const audience = roles?.length ? [...roles].sort().join(',') : 'guest';
  return ['applications', 'visible', audience] as const;
}
