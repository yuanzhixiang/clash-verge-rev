import type { InvokeArgs, InvokeOptions } from '@tauri-apps/api/core'
import { mockConvertFileSrc, mockIPC, mockWindows } from '@tauri-apps/api/mocks'

import { isReadOnlyCliPayload, safeDevReadOnlyError } from './remote-read-only'

type InvokePayload = Record<string, unknown>
type CliPayload = Record<string, unknown>
type CliResponse<T> = { ok: boolean; data?: T; error?: string }
type MockChannel = { onmessage?: (message: unknown) => void }
type NativeInvoke = <T>(
  cmd: string,
  args?: InvokeArgs,
  options?: InvokeOptions,
) => Promise<T>
type SafeTauriInvokeBridge = (
  nativeInvoke: NativeInvoke,
  cmd: string,
  args?: InvokeArgs,
  options?: InvokeOptions,
) => Promise<unknown>
type TauriInternals = {
  plugins?: { path?: { sep: string; delimiter: string } }
  invoke?: NativeInvoke
}
type TauriWindow = Window & {
  __TAURI_INTERNALS__?: TauriInternals
  __VERGE_SAFE_TAURI_INVOKE__?: SafeTauriInvokeBridge
}
type HttpRequest = {
  method?: string
  url?: string
  headers?: [string, string][]
  data?: unknown
}

const WS_INTERVAL_MS = 500
const SAFE_TAURI = import.meta.env.VITE_VERGE_SAFE_TAURI === '1'
const READ_ONLY =
  SAFE_TAURI || import.meta.env.VITE_VERGE_REMOTE_READ_ONLY === '1'
const wsCleanups = new Map<number, () => void>()
let nextWsId = 1
let nextResourceId = 1
let bridgeInstalled = false
const httpRequests = new Map<number, Promise<Response>>()
const httpBodies = new Map<number, Uint8Array>()

const payloadOf = (args?: InvokeArgs): InvokePayload =>
  args && typeof args === 'object' && !Array.isArray(args)
    ? (args as InvokePayload)
    : {}

const valueOf = (args: InvokePayload, key: string) => args[key]
const stringOf = (args: InvokePayload, key: string) =>
  String(valueOf(args, key) ?? '')
const recordOf = (value: unknown): InvokePayload =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as InvokePayload)
    : {}
const currentTheme = () =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
const tauriInternals = () =>
  (window as unknown as TauriWindow).__TAURI_INTERNALS__
const requireTauriInternals = () => {
  const internals = tauriInternals()
  if (!internals) {
    throw new Error('[Remote App] Tauri internals are unavailable')
  }
  return internals
}

const cli = async <T = unknown>(payload: CliPayload): Promise<T> => {
  if (READ_ONLY && !isReadOnlyCliPayload(payload)) {
    throw safeDevReadOnlyError(
      `CLI request: ${String(payload.cmd ?? 'unknown')}/${String(payload.action ?? '')}`,
    )
  }

  const response = await fetch('/__verge/cli', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = (await response.json()) as CliResponse<T>
  if (!response.ok) {
    throw new Error(result.error || `remote app bridge HTTP ${response.status}`)
  }
  if (!result.ok) throw new Error(result.error || 'remote app bridge failed')
  return result.data as T
}

const configGet = <T = unknown>(target: string) =>
  cli<T>({ cmd: 'config_get', target, format: 'json' })

const isWindows = () => OS_PLATFORM === 'win32'
const pathSeparator = () => (isWindows() ? '\\' : '/')

const joinPathParts = (parts: unknown[]) => {
  const separator = pathSeparator()
  const joined = parts
    .map((part) => String(part ?? ''))
    .filter(Boolean)
    .join(separator)
  return separator === '\\'
    ? joined.replace(/\\+/g, separator)
    : joined.replace(/\/+/g, separator)
}

const basenameOf = (value: string) =>
  value.split(/[\\/]/).filter(Boolean).pop() ?? ''

const byteArray = (value: unknown): Uint8Array | undefined => {
  if (value instanceof Uint8Array) return value
  if (Array.isArray(value) && value.every((item) => typeof item === 'number')) {
    return new Uint8Array(value)
  }
  return undefined
}

const httpHeaders = (headers: unknown) =>
  Array.isArray(headers)
    ? Object.fromEntries(
        headers.filter(
          (header): header is [string, string] =>
            Array.isArray(header) &&
            typeof header[0] === 'string' &&
            typeof header[1] === 'string',
        ),
      )
    : undefined

const requestBody = (data: HttpRequest['data']): BodyInit | undefined => {
  const bytes = byteArray(data)
  if (bytes) {
    const buffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(buffer).set(bytes)
    return buffer
  }
  if (
    typeof data === 'string' ||
    data instanceof Blob ||
    data instanceof FormData ||
    data instanceof URLSearchParams ||
    data instanceof ReadableStream
  ) {
    return data
  }
  return undefined
}

const sendText = (channel: MockChannel, data: unknown) => {
  channel.onmessage?.({ type: 'Text', data: JSON.stringify(data) })
}

const sendRawText = (channel: MockChannel, data: string) => {
  channel.onmessage?.({ type: 'Text', data })
}

const openPollingSocket = (
  args: InvokePayload,
  tick: (channel: MockChannel) => Promise<void>,
  intervalMs = WS_INTERVAL_MS,
) => {
  const channel = valueOf(args, 'onMessage') as MockChannel | undefined
  if (!channel?.onmessage) throw new Error('missing mock websocket channel')

  const id = nextWsId++
  let closed = false
  let busy = false

  const run = async () => {
    if (closed || busy) return
    busy = true
    try {
      await tick(channel)
    } catch (error) {
      sendRawText(channel, `Websocket error: ${String(error)}`)
    } finally {
      busy = false
    }
  }

  const timer = window.setInterval(run, intervalMs)
  wsCleanups.set(id, () => {
    closed = true
    window.clearInterval(timer)
  })
  void run()
  return id
}

const closeSocket = (id: number) => {
  wsCleanups.get(id)?.()
  wsCleanups.delete(id)
}

const closeAllSockets = () => {
  Array.from(wsCleanups.keys()).forEach(closeSocket)
}

const parseLog = (raw: string): ILogItem => {
  try {
    const parsed = JSON.parse(raw) as Partial<ILogItem>
    if (parsed.type && parsed.payload) {
      return {
        time: parsed.time || '',
        type: parsed.type,
        payload: parsed.payload,
      } as ILogItem
    }
  } catch {}

  const quoted = raw.match(/time="(.+?)"\s+level=(.+?)\s+msg="(.+?)"/)
  if (quoted) {
    return { time: quoted[1], type: quoted[2], payload: quoted[3] } as ILogItem
  }

  const plain = raw.match(/(.+?)\s+(.+?)\s+(.+)/)
  if (plain) {
    return { time: plain[1], type: plain[2], payload: plain[3] } as ILogItem
  }

  return { time: '', type: 'info', payload: raw } as ILogItem
}

const openConnectionsSocket = (args: InvokePayload) =>
  openPollingSocket(args, async (channel) => {
    const data = await cli({ cmd: 'connections', action: 'list' })
    sendText(channel, data)
  })

const openTrafficSocket = (args: InvokePayload) => {
  let previousUpTotal: number | null = null
  let previousDownTotal: number | null = null

  return openPollingSocket(args, async (channel) => {
    const data = await cli<{
      uploadTotal?: number
      downloadTotal?: number
    }>({ cmd: 'connections', action: 'list' })
    const upTotal = data.uploadTotal ?? 0
    const downTotal = data.downloadTotal ?? 0
    const up =
      previousUpTotal === null ? 0 : Math.max(0, upTotal - previousUpTotal)
    const down =
      previousDownTotal === null
        ? 0
        : Math.max(0, downTotal - previousDownTotal)
    previousUpTotal = upTotal
    previousDownTotal = downTotal
    sendText(channel, { up, down, upTotal, downTotal })
  })
}

const openMemorySocket = (args: InvokePayload) =>
  openPollingSocket(
    args,
    async (channel) => {
      sendText(channel, { inuse: 0 })
    },
    2000,
  )

const openLogsSocket = (args: InvokePayload) => {
  const seen = new Set<string>()
  let ready = false

  return openPollingSocket(
    args,
    async (channel) => {
      const data = await cli<{ lines?: string[] }>({
        cmd: 'logs',
        target: 'core',
        lines: 80,
      })
      const lines = data.lines ?? []
      if (!ready) {
        lines.forEach((line) => seen.add(line))
        ready = true
        return
      }
      lines.forEach((line) => {
        if (seen.has(line)) return
        seen.add(line)
        sendRawText(channel, JSON.stringify(parseLog(line)))
      })
    },
    1000,
  )
}

const handleHttp = async (cmd: string, args: InvokePayload) => {
  switch (cmd) {
    case 'plugin:http|fetch': {
      const clientConfig = recordOf(args.clientConfig) as HttpRequest
      const rid = nextResourceId++
      const response = fetch(String(clientConfig.url ?? ''), {
        method: clientConfig.method,
        headers: httpHeaders(clientConfig.headers),
        body: requestBody(clientConfig.data),
      })
      httpRequests.set(rid, response)
      return rid
    }
    case 'plugin:http|fetch_send': {
      const rid = Number(args.rid)
      const response = await httpRequests.get(rid)
      if (!response) throw new Error(`unknown HTTP request resource: ${rid}`)
      const bodyRid = nextResourceId++
      httpBodies.set(bodyRid, new Uint8Array(await response.arrayBuffer()))
      return {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        headers: Array.from(response.headers.entries()),
        rid: bodyRid,
      }
    }
    case 'plugin:http|fetch_read_body': {
      const rid = Number(args.rid)
      const body = httpBodies.get(rid) ?? new Uint8Array()
      httpBodies.delete(rid)
      const chunk = new Uint8Array(body.length + 1)
      chunk.set(body)
      chunk[chunk.length - 1] = 1
      return Array.from(chunk)
    }
    case 'plugin:http|fetch_cancel':
      httpRequests.delete(Number(args.rid))
      return null
    case 'plugin:http|fetch_cancel_body':
      httpBodies.delete(Number(args.rid))
      return null
    default:
      throw new Error(`unsupported remote HTTP command: ${cmd}`)
  }
}

const READ_ONLY_HTTP_COMMANDS = new Set([
  'plugin:http|fetch',
  'plugin:http|fetch_send',
  'plugin:http|fetch_read_body',
  'plugin:http|fetch_cancel',
  'plugin:http|fetch_cancel_body',
])

const READ_ONLY_PATH_COMMANDS = new Set([
  'plugin:path|join',
  'plugin:path|resolve',
  'plugin:path|normalize',
  'plugin:path|dirname',
  'plugin:path|basename',
  'plugin:path|extname',
  'plugin:path|is_absolute',
  'plugin:path|resolve_directory',
])

const READ_ONLY_UTILITY_COMMANDS = new Set([
  'plugin:clipboard-manager|read_text',
  'plugin:dialog|message',
  'plugin:fs|exists',
  'plugin:fs|read_text_file',
  'plugin:fs|read_file',
])

const READ_ONLY_MIHOMO_COMMANDS = new Set([
  'plugin:mihomo|get_version',
  'plugin:mihomo|get_connections',
  'plugin:mihomo|get_groups',
  'plugin:mihomo|get_group_by_name',
  'plugin:mihomo|get_proxies',
  'plugin:mihomo|get_proxy_by_name',
  'plugin:mihomo|get_proxy_providers',
  'plugin:mihomo|get_proxy_provider_by_name',
  'plugin:mihomo|get_rules',
  'plugin:mihomo|get_rule_providers',
  'get_rule_provider_content',
  'plugin:mihomo|get_base_config',
  'plugin:mihomo|ws_connections',
  'plugin:mihomo|ws_traffic',
  'plugin:mihomo|ws_memory',
  'plugin:mihomo|ws_logs',
  'plugin:mihomo|ws_disconnect',
  'plugin:mihomo|clear_all_ws_connections',
])

const READ_ONLY_APP_PLUGIN_COMMANDS = new Set([
  'plugin:app|name',
  'plugin:app|version',
  'plugin:app|identifier',
  'plugin:app|tauri_version',
])

const READ_ONLY_APP_COMMANDS = new Set([
  'get_verge_config',
  'get_profiles',
  'read_profile_file',
  'get_next_update_time',
  'get_clash_info',
  'get_clash_mode',
  'check_dns_config_exists',
  'get_dns_config_content',
  'validate_dns_config',
  'get_runtime_config',
  'get_runtime_yaml',
  'get_runtime_exists',
  'get_runtime_logs',
  'get_runtime_proxy_chain_config',
  'get_clash_logs',
  'get_sys_proxy',
  'get_auto_proxy',
  'get_auto_launch_status',
  'get_network_interfaces',
  'get_network_interfaces_info',
  'get_system_hostname',
  'is_service_available',
  'is_port_in_use',
  'get_running_mode',
  'get_app_dir',
  'get_cli_install_status',
  'get_system_info',
  'list_local_backup',
  'list_webdav_backup',
  'get_unlock_items',
  'app_is_admin',
  'get_app_uptime',
  'get_portable_flag',
])

const assertReadOnlyCommand = (cmd: string, args: InvokePayload) => {
  if (!READ_ONLY) return

  if (READ_ONLY_HTTP_COMMANDS.has(cmd)) {
    if (cmd === 'plugin:http|fetch') {
      const clientConfig = recordOf(args.clientConfig) as HttpRequest
      const method = String(clientConfig.method || 'GET').toUpperCase()
      if (method !== 'GET' && method !== 'HEAD') {
        throw safeDevReadOnlyError(`${cmd} ${method}`)
      }
    }
    return
  }

  if (
    READ_ONLY_PATH_COMMANDS.has(cmd) ||
    READ_ONLY_UTILITY_COMMANDS.has(cmd) ||
    READ_ONLY_MIHOMO_COMMANDS.has(cmd) ||
    READ_ONLY_APP_PLUGIN_COMMANDS.has(cmd) ||
    READ_ONLY_APP_COMMANDS.has(cmd)
  ) {
    return
  }

  throw safeDevReadOnlyError(`command: ${cmd}`)
}

const handlePath = async (
  cmd: string,
  args: InvokePayload,
): Promise<string | boolean> => {
  switch (cmd) {
    case 'plugin:path|join':
    case 'plugin:path|resolve':
      return joinPathParts(Array.isArray(args.paths) ? args.paths : [])
    case 'plugin:path|normalize':
      return joinPathParts([args.path])
    case 'plugin:path|dirname': {
      const value = stringOf(args, 'path')
      const index = value.lastIndexOf(pathSeparator())
      return index > 0 ? value.slice(0, index) : value
    }
    case 'plugin:path|basename': {
      const name = basenameOf(stringOf(args, 'path'))
      const ext = stringOf(args, 'ext')
      return ext && name.endsWith(ext) ? name.slice(0, -ext.length) : name
    }
    case 'plugin:path|extname': {
      const name = basenameOf(stringOf(args, 'path'))
      const index = name.lastIndexOf('.')
      return index > -1 ? name.slice(index + 1) : ''
    }
    case 'plugin:path|is_absolute': {
      const value = stringOf(args, 'path')
      return isWindows() ? /^[a-z]:[\\/]/i.test(value) : value.startsWith('/')
    }
    case 'plugin:path|resolve_directory': {
      const paths = await cli<{ app_dir?: string }>({ cmd: 'paths' })
      return paths.app_dir || ''
    }
    default:
      throw new Error(`unsupported remote path command: ${cmd}`)
  }
}

const handleUtilityPlugin = async (cmd: string, args: InvokePayload) => {
  switch (cmd) {
    case 'plugin:clipboard-manager|read_text':
      return navigator.clipboard?.readText?.().catch(() => '') ?? ''
    case 'plugin:clipboard-manager|write_text':
      await navigator.clipboard
        ?.writeText?.(stringOf(args, 'text'))
        .catch(() => {})
      return null
    case 'plugin:clipboard-manager|clear':
      await navigator.clipboard?.writeText?.('').catch(() => {})
      return null
    case 'plugin:dialog|open':
    case 'plugin:dialog|save':
      return null
    case 'plugin:dialog|message':
      return null
    case 'plugin:shell|open':
      window.open(stringOf(args, 'path'), '_blank', 'noopener,noreferrer')
      return null
    case 'plugin:process|restart':
      return null
    case 'plugin:process|exit':
      return null
    case 'plugin:fs|exists':
      return false
    case 'plugin:fs|read_text_file':
      return ''
    case 'plugin:fs|read_file':
      return []
    case 'plugin:fs|write_text_file':
    case 'plugin:fs|write_file':
      return null
    default:
      throw new Error(`unsupported remote plugin command: ${cmd}`)
  }
}

const handleMihomo = async (cmd: string, args: InvokePayload) => {
  switch (cmd) {
    case 'plugin:mihomo|get_version':
      return { version: 'remote', meta: false }
    case 'plugin:mihomo|get_connections':
      return cli({ cmd: 'connections', action: 'list' })
    case 'plugin:mihomo|close_connection':
      return cli({
        cmd: 'connections',
        action: 'close',
        id: stringOf(args, 'connectionId'),
      })
    case 'plugin:mihomo|close_all_connections':
      return cli({ cmd: 'connections', action: 'close_all' })
    case 'plugin:mihomo|get_groups':
      return cli({ cmd: 'proxies', action: 'groups' })
    case 'plugin:mihomo|get_group_by_name':
      return cli({
        cmd: 'proxies',
        action: 'group',
        group: stringOf(args, 'groupName'),
      })
    case 'plugin:mihomo|get_proxies':
      return cli({ cmd: 'proxies', action: 'list' })
    case 'plugin:mihomo|get_proxy_by_name':
      return cli({
        cmd: 'proxies',
        action: 'node',
        node: stringOf(args, 'proxyName') || stringOf(args, 'proxiesName'),
      })
    case 'plugin:mihomo|get_proxy_providers':
      return cli({ cmd: 'proxies', action: 'providers' })
    case 'plugin:mihomo|get_proxy_provider_by_name':
      return cli({
        cmd: 'proxies',
        action: 'provider',
        provider: stringOf(args, 'providerName'),
      })
    case 'plugin:mihomo|select_node_for_group':
      return cli({
        cmd: 'proxies',
        action: 'select',
        group: stringOf(args, 'groupName'),
        node: stringOf(args, 'node'),
      })
    case 'plugin:mihomo|delay_group':
      return cli({
        cmd: 'proxies',
        action: 'delay_group',
        group: stringOf(args, 'groupName'),
        url: stringOf(args, 'testUrl'),
        timeout: Number(valueOf(args, 'timeout') ?? 10000),
      })
    case 'plugin:mihomo|delay_proxy_by_name':
      return cli({
        cmd: 'proxies',
        action: 'delay',
        node: stringOf(args, 'proxyName'),
        url: stringOf(args, 'testUrl'),
        timeout: Number(valueOf(args, 'timeout') ?? 10000),
      })
    case 'plugin:mihomo|healthcheck_proxy_provider':
      return cli({
        cmd: 'proxies',
        action: 'healthcheck_provider',
        provider: stringOf(args, 'providerName'),
      })
    case 'plugin:mihomo|healthcheck_node_in_provider':
      return cli({
        cmd: 'proxies',
        action: 'delay',
        node: stringOf(args, 'proxyName'),
        url: stringOf(args, 'testUrl'),
        timeout: Number(valueOf(args, 'timeout') ?? 10000),
      })
    case 'plugin:mihomo|update_proxy_provider':
      return cli({
        cmd: 'proxies',
        action: 'update_provider',
        provider: stringOf(args, 'providerName'),
      })
    case 'plugin:mihomo|get_rules':
      return cli({ cmd: 'rules', action: 'list' })
    case 'plugin:mihomo|get_rule_providers':
      return cli({ cmd: 'rules', action: 'providers' })
    case 'plugin:mihomo|update_rule_provider':
      return cli({
        cmd: 'rules',
        action: 'update_provider',
        provider: stringOf(args, 'providerName'),
      })
    case 'get_rule_provider_content':
      return cli({
        cmd: 'rules',
        action: 'content',
        provider: stringOf(args, 'providerName'),
      })
    case 'plugin:mihomo|get_base_config':
      return configGet('runtime')
    case 'plugin:mihomo|patch_base_config':
      return cli({
        cmd: 'config_patch',
        target: 'clash',
        patch: valueOf(args, 'data'),
      })
    case 'plugin:mihomo|restart':
      return cli({ cmd: 'core', action: 'restart' })
    case 'plugin:mihomo|unfixed_proxy':
      return null
    case 'plugin:mihomo|ws_connections':
      return openConnectionsSocket(args)
    case 'plugin:mihomo|ws_traffic':
      return openTrafficSocket(args)
    case 'plugin:mihomo|ws_memory':
      return openMemorySocket(args)
    case 'plugin:mihomo|ws_logs':
      return openLogsSocket(args)
    case 'plugin:mihomo|ws_disconnect':
      closeSocket(Number(valueOf(args, 'id')))
      return null
    case 'plugin:mihomo|clear_all_ws_connections':
      closeAllSockets()
      return null
    case 'plugin:mihomo|update_controller':
    case 'plugin:mihomo|update_secret':
    case 'plugin:mihomo|flush_fakeip':
    case 'plugin:mihomo|flush_dns':
    case 'plugin:mihomo|reload_config':
    case 'plugin:mihomo|update_geo':
    case 'plugin:mihomo|upgrade_core':
    case 'plugin:mihomo|upgrade_ui':
    case 'plugin:mihomo|upgrade_geo':
      return null
    default:
      throw new Error(`unsupported remote mihomo command: ${cmd}`)
  }
}

const handleWindow = (cmd: string) => {
  switch (cmd) {
    case 'plugin:window|theme':
      return currentTheme()
    case 'plugin:window|title':
      return 'Clash Verge'
    case 'plugin:window|scale_factor':
      return window.devicePixelRatio || 1
    case 'plugin:window|inner_size':
    case 'plugin:window|outer_size':
      return { width: window.innerWidth, height: window.innerHeight }
    case 'plugin:window|inner_position':
    case 'plugin:window|outer_position':
      return { x: window.screenX, y: window.screenY }
    case 'plugin:window|is_decorated':
    case 'plugin:window|is_resizable':
    case 'plugin:window|is_maximizable':
    case 'plugin:window|is_minimizable':
    case 'plugin:window|is_closable':
    case 'plugin:window|is_visible':
    case 'plugin:window|is_focused':
    case 'plugin:window|is_enabled':
      return true
    case 'plugin:window|is_maximized':
    case 'plugin:window|is_minimized':
    case 'plugin:window|is_fullscreen':
    case 'plugin:window|is_always_on_top':
      return false
    default:
      if (cmd.startsWith('plugin:window|set_')) return null
      if (cmd.startsWith('plugin:window|')) return null
      return undefined
  }
}

const handleApp = async (cmd: string) => {
  switch (cmd) {
    case 'plugin:app|name':
      return 'Clash Verge'
    case 'plugin:app|version': {
      const status = await cli<{ version?: string }>({ cmd: 'status' })
      return status.version || 'remote'
    }
    case 'plugin:app|identifier':
      return 'io.github.clash-verge-rev.clash-verge-rev'
    case 'plugin:app|tauri_version':
      return 'remote'
    default:
      return null
  }
}

const handleCommand = async (cmd: string, args: InvokePayload) => {
  assertReadOnlyCommand(cmd, args)

  if (cmd.startsWith('plugin:http|')) return handleHttp(cmd, args)
  if (cmd.startsWith('plugin:path|')) return handlePath(cmd, args)
  if (
    cmd.startsWith('plugin:clipboard-manager|') ||
    cmd.startsWith('plugin:dialog|') ||
    cmd.startsWith('plugin:shell|') ||
    cmd.startsWith('plugin:process|') ||
    cmd.startsWith('plugin:fs|')
  ) {
    return handleUtilityPlugin(cmd, args)
  }
  if (cmd.startsWith('plugin:mihomo|')) return handleMihomo(cmd, args)
  if (cmd.startsWith('plugin:window|')) return handleWindow(cmd)
  if (cmd.startsWith('plugin:app|')) return handleApp(cmd)

  switch (cmd) {
    case 'copy_clash_env':
      return cli({ cmd: 'clash', action: 'copy_env' })
    case 'get_verge_config':
      return configGet('verge')
    case 'patch_verge_config':
      return cli({ cmd: 'config_patch', target: 'verge', patch: args.payload })
    case 'get_profiles':
      return cli({ cmd: 'profiles', action: 'list' })
    case 'patch_profiles_config':
      return cli({ cmd: 'profiles', action: 'patch', profile: args.profiles })
    case 'create_profile':
      return cli({
        cmd: 'profiles',
        action: 'create',
        item: args.item,
        file_data: args.fileData,
      })
    case 'enhance_profiles':
      return cli({ cmd: 'profiles', action: 'enhance' })
    case 'import_profile':
      return cli({
        cmd: 'profiles',
        action: 'import',
        url: args.url,
        option: args.option,
      })
    case 'update_profile':
      return cli({
        cmd: 'profiles',
        action: 'update',
        index: args.index,
        option: args.option,
      })
    case 'delete_profile':
      return cli({ cmd: 'profiles', action: 'delete', index: args.index })
    case 'reorder_profile':
      return cli({
        cmd: 'profiles',
        action: 'reorder',
        index: args.activeId,
        over_id: args.overId,
      })
    case 'patch_profile':
      return cli({
        cmd: 'profiles',
        action: 'patch',
        index: args.index,
        profile: args.profile,
      })
    case 'view_profile':
    case 'reveal_profile_file':
      return null
    case 'read_profile_file': {
      const data = await cli<{ content?: string }>({
        cmd: 'profiles',
        action: 'read_file',
        index: args.index,
      })
      return data.content || ''
    }
    case 'save_profile_file':
      return cli({
        cmd: 'profiles',
        action: 'save_file',
        index: args.index,
        data: args.fileData,
      })
    case 'get_next_update_time': {
      const data = await cli<{ next_update?: number | null }>({
        cmd: 'profiles',
        action: 'next_update',
        index: args.uid,
      })
      return data.next_update ?? null
    }
    case 'get_clash_info':
      return cli({ cmd: 'clash', action: 'info' })
    case 'get_clash_mode': {
      const data = await cli<{ mode?: string }>({
        cmd: 'clash',
        action: 'mode_get',
      })
      return data.mode ?? null
    }
    case 'patch_clash_mode':
      return cli({ cmd: 'clash', action: 'mode_set', value: args.payload })
    case 'change_clash_core': {
      const data = await cli<{ message?: string | null }>({
        cmd: 'clash',
        action: 'core_set',
        value: args.clashCore,
      })
      return data.message ?? null
    }
    case 'patch_clash_config':
      return cli({ cmd: 'config_patch', target: 'clash', patch: args.payload })
    case 'test_delay': {
      const data = await cli<{ delay?: number }>({
        cmd: 'clash',
        action: 'delay',
        value: args.url,
      })
      return data.delay ?? 0
    }
    case 'clash_api_get_proxy_delay':
      return cli({
        cmd: 'proxies',
        action: 'delay',
        node: args.name,
        url: args.url,
        timeout: args.timeout,
      })
    case 'save_dns_config':
      return cli({
        cmd: 'clash',
        action: 'dns_save',
        patch: args.dnsConfig,
      })
    case 'apply_dns_config':
      return cli({
        cmd: 'clash',
        action: 'dns_apply',
        apply: args.apply,
      })
    case 'check_dns_config_exists':
      return cli({ cmd: 'clash', action: 'dns_exists' })
    case 'get_dns_config_content': {
      const data = await cli<{ content?: string }>({
        cmd: 'clash',
        action: 'dns_get',
      })
      return data.content || ''
    }
    case 'validate_dns_config':
      return cli({ cmd: 'clash', action: 'dns_validate' })
    case 'get_runtime_config':
      return cli({ cmd: 'runtime', action: 'get' })
    case 'get_runtime_yaml': {
      const data = await cli<{ content?: string }>({
        cmd: 'runtime',
        action: 'yaml',
      })
      return data.content ?? null
    }
    case 'get_runtime_exists':
      return cli({ cmd: 'runtime', action: 'exists' })
    case 'get_runtime_logs':
      return cli({ cmd: 'runtime', action: 'logs' })
    case 'get_runtime_proxy_chain_config': {
      const data = await cli<{ content?: string }>({
        cmd: 'runtime',
        action: 'proxy_chain_get',
        value: args.proxyChainExitNode,
      })
      return data.content || ''
    }
    case 'update_proxy_chain_config_in_runtime':
      return cli({
        cmd: 'runtime',
        action: 'proxy_chain_set',
        patch: args.proxyChainConfig,
      })
    case 'get_clash_logs': {
      const data = await cli<{ lines?: string[] }>({
        cmd: 'logs',
        target: 'core',
        lines: 1000,
      })
      return data.lines || []
    }
    case 'get_sys_proxy':
      return cli({ cmd: 'system', action: 'proxy_get' })
    case 'get_auto_proxy':
      return cli({ cmd: 'system', action: 'auto_proxy_get' })
    case 'get_auto_launch_status':
      return cli({ cmd: 'system', action: 'auto_launch_get' })
    case 'get_network_interfaces':
      return cli({ cmd: 'system', action: 'interfaces' })
    case 'get_network_interfaces_info':
      return cli({ cmd: 'system', action: 'interfaces_info' })
    case 'get_system_hostname': {
      const data = await cli<{ hostname?: string }>({
        cmd: 'system',
        action: 'hostname',
      })
      return data.hostname || ''
    }
    case 'is_service_available': {
      const data = await cli<{ available?: boolean }>({
        cmd: 'service',
        action: 'status',
      })
      return Boolean(data.available)
    }
    case 'is_port_in_use': {
      const data = await cli<{ in_use?: boolean }>({
        cmd: 'system',
        action: 'port_in_use',
        port: Number(args.port),
      })
      return Boolean(data.in_use)
    }
    case 'get_running_mode': {
      const data = await cli<{ running_mode?: string }>({ cmd: 'status' })
      return data.running_mode || 'Sidecar'
    }
    case 'get_app_dir': {
      const data = await cli<{ app_dir?: string }>({ cmd: 'paths' })
      return data.app_dir || ''
    }
    case 'get_cli_install_status': {
      const data = await cli<{ version?: string }>({ cmd: 'status' })
      return {
        installed: true,
        versionMatches: true,
        path: 'vergectl',
        installDir: '',
        sourcePath: null,
        version: data.version,
      }
    }
    case 'install_cli':
    case 'uninstall_cli':
      return handleCommand('get_cli_install_status', args)
    case 'get_system_info': {
      const data = await cli<{
        version?: string
        running_mode?: string
      }>({ cmd: 'status' })
      return {
        system_name: navigator.platform,
        system_version: '',
        system_kernel_version: '',
        system_arch: OS_PLATFORM,
        app_version: data.version || '',
        app_core_mode: data.running_mode || 'Sidecar',
        app_is_admin: false,
      }
    }
    case 'start_core':
    case 'stop_core':
    case 'restart_core':
      return cli({ cmd: 'core', action: cmd.replace('_core', '') })
    case 'create_local_backup':
      return cli({ cmd: 'backup_create' })
    case 'list_local_backup':
      return cli({ cmd: 'backup', area: 'local', action: 'list' })
    case 'delete_local_backup':
      return cli({
        cmd: 'backup',
        area: 'local',
        action: 'delete',
        filename: args.filename,
      })
    case 'restore_local_backup':
      return cli({
        cmd: 'backup',
        area: 'local',
        action: 'restore',
        filename: args.filename,
      })
    case 'import_local_backup': {
      const data = await cli<{ filename?: string }>({
        cmd: 'backup',
        area: 'local',
        action: 'import',
        source: args.source,
      })
      return data.filename || ''
    }
    case 'export_local_backup':
      return cli({
        cmd: 'backup',
        area: 'local',
        action: 'export',
        filename: args.filename,
        destination: args.destination,
      })
    case 'save_webdav_config':
      return cli({
        cmd: 'backup',
        area: 'webdav',
        action: 'config',
        url: args.url,
        username: args.username,
        password: args.password,
      })
    case 'create_webdav_backup':
      return cli({ cmd: 'backup', area: 'webdav', action: 'create' })
    case 'list_webdav_backup':
      return cli({ cmd: 'backup', area: 'webdav', action: 'list' })
    case 'delete_webdav_backup':
      return cli({
        cmd: 'backup',
        area: 'webdav',
        action: 'delete',
        filename: args.filename,
      })
    case 'restore_webdav_backup':
      return cli({
        cmd: 'backup',
        area: 'webdav',
        action: 'restore',
        filename: args.filename,
      })
    case 'validate_script_file':
      return cli({ cmd: 'validate', action: 'script', file: args.filePath })
    case 'get_unlock_items':
      return cli({ cmd: 'unlock', action: 'list' })
    case 'check_media_unlock':
      return cli({ cmd: 'unlock', action: 'check' })
    case 'install_service':
    case 'uninstall_service':
    case 'repair_service':
    case 'reinstall_service':
      return cli({ cmd: 'service', action: cmd.replace('_service', '') })
    case 'entry_lightweight_mode':
      return cli({ cmd: 'app', action: 'lightweight_enter' })
    case 'exit_lightweight_mode':
      return cli({ cmd: 'app', action: 'lightweight_exit' })
    case 'export_diagnostic_info':
      return cli({ cmd: 'app', action: 'diagnostics_export' })
    case 'download_icon_cache':
      return stringOf(args, 'url')
    case 'copy_icon_file':
      return stringOf(args, 'path')
    case 'app_is_admin':
      return false
    case 'get_app_uptime':
      return 0
    case 'get_portable_flag':
      return false
    case 'open_web_url':
      window.open(stringOf(args, 'url'), '_blank', 'noopener,noreferrer')
      return null
    case 'clear_logs':
    case 'sync_tray_proxy_selection':
    case 'script_validate_notice':
    case 'invoke_uwp_tool':
    case 'open_app_dir':
    case 'open_core_dir':
    case 'open_logs_dir':
    case 'open_devtools':
    case 'exit_app':
    case 'restart_app':
      return null
    default:
      throw new Error(`unsupported remote Tauri command: ${cmd}`)
  }
}

export const setupRemoteTauriBridge = () => {
  if (bridgeInstalled) return
  bridgeInstalled = true

  if (SAFE_TAURI) {
    const internals = requireTauriInternals()
    if (!internals.invoke) {
      throw new Error('[Safe Dev] native Tauri invoke is unavailable')
    }

    ;(window as unknown as TauriWindow).__VERGE_SAFE_TAURI_INVOKE__ = (
      nativeInvoke,
      cmd: string,
      args?: InvokeArgs,
      options?: InvokeOptions,
    ) => {
      if (cmd.startsWith('plugin:window|') || cmd.startsWith('plugin:event|')) {
        return nativeInvoke(cmd, args, options)
      }
      return handleCommand(cmd, payloadOf(args))
    }
    window.addEventListener('beforeunload', closeAllSockets)
    return
  }

  mockWindows('main')
  mockConvertFileSrc(
    OS_PLATFORM === 'win32'
      ? 'windows'
      : OS_PLATFORM === 'darwin'
        ? 'macos'
        : 'linux',
  )
  const internals = requireTauriInternals()
  internals.plugins = {
    ...internals.plugins,
    path: {
      sep: pathSeparator(),
      delimiter: isWindows() ? ';' : ':',
    },
  }
  mockIPC((cmd, args) => handleCommand(cmd, payloadOf(args)), {
    shouldMockEvents: true,
  })
  window.addEventListener('beforeunload', closeAllSockets)
}
