export const RELEASE_LOCK_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`
export const EXTEND_LOCK_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], tonumber(ARGV[2]))
end
return 0
`
export const TRANSITION_ACTIVE_RESTART_SCRIPT = `
if redis.call('get', KEYS[1]) ~= ARGV[1] then
  return -1
end
local generation = tonumber(redis.call('get', KEYS[2]) or '0')
if generation ~= tonumber(ARGV[2]) then
  return 0
end
if ARGV[3] == '' then
  return redis.call('del', KEYS[1])
end
redis.call('psetex', KEYS[1], tonumber(ARGV[4]), ARGV[3])
return 1
`
