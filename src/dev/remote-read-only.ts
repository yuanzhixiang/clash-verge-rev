export type RemoteCliPayload = Record<string, unknown>

const stringValue = (payload: RemoteCliPayload, key: string) =>
  typeof payload[key] === 'string' ? payload[key] : ''

const hasValue = (values: readonly string[], value: string) =>
  values.includes(value)

/**
 * Commands accepted by the Safe Dev relay. Everything not listed here is
 * rejected before a request reaches the running Clash Verge application.
 */
export const isReadOnlyCliPayload = (payload: RemoteCliPayload) => {
  const command = stringValue(payload, 'cmd')
  const action = stringValue(payload, 'action')

  switch (command) {
    case 'status':
    case 'paths':
      return true
    case 'config_get':
      return hasValue(
        ['verge', 'clash', 'runtime'],
        stringValue(payload, 'target'),
      )
    case 'logs':
      return hasValue(['app', 'core'], stringValue(payload, 'target'))
    case 'system':
      return hasValue(
        [
          'proxy_get',
          'auto_proxy_get',
          'auto_launch_get',
          'interfaces',
          'interfaces_info',
          'hostname',
          'port_in_use',
        ],
        action,
      )
    case 'service':
      return action === 'status'
    case 'clash':
      return hasValue(
        ['info', 'mode_get', 'dns_exists', 'dns_get', 'dns_validate'],
        action,
      )
    case 'runtime':
      return hasValue(
        ['get', 'yaml', 'exists', 'logs', 'proxy_chain_get'],
        action,
      )
    case 'profiles':
      return hasValue(['list', 'read_file', 'next_update'], action)
    case 'proxies':
      return hasValue(
        ['list', 'groups', 'group', 'node', 'providers', 'provider'],
        action,
      )
    case 'connections':
      return action === 'list'
    case 'rules':
      return hasValue(['list', 'providers'], action)
    case 'unlock':
      return action === 'list'
    case 'backup':
      return (
        action === 'list' &&
        hasValue(['local', 'webdav'], stringValue(payload, 'area'))
      )
    default:
      return false
  }
}

export const safeDevReadOnlyError = (subject: string) =>
  new Error(`[Safe Dev] read-only mode blocked ${subject}`)
