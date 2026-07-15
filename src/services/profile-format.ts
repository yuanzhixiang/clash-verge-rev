import yaml from 'js-yaml'

export type ProfileFormat = 'yaml' | 'conf'
export type ProfileEntryKind = 'proxy' | 'group'

type ProfileObject = Record<string, unknown>

const SPECIAL_KEYS = new Set([
  'proxies',
  'proxy-groups',
  'proxy-providers',
  'rule-providers',
  'rules',
  'hosts',
])

function isObject(value: unknown): value is ProfileObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function splitTopLevel(input: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let quoted = false
  let escaped = false
  let depth = 0
  for (const char of input) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\' && quoted) {
      current += char
      escaped = true
    } else if (char === '"') {
      quoted = !quoted
      current += char
    } else if (!quoted && (char === '[' || char === '{')) {
      depth += 1
      current += char
    } else if (!quoted && (char === ']' || char === '}')) {
      depth = Math.max(0, depth - 1)
      current += char
    } else if (!quoted && depth === 0 && char === delimiter) {
      if (current.trim()) result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) result.push(current.trim())
  return result
}

function splitAssignment(input: string, line: number): [string, string] {
  const pieces = splitTopLevel(input, '=')
  if (pieces.length < 2) throw new Error(`Missing '=' at line ${line}`)
  return [pieces[0], pieces.slice(1).join('=').trim()]
}

function stripInlineComment(input: string): string {
  let quoted = false
  let escaped = false
  let depth = 0
  let previousWhitespace = true
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (escaped) {
      escaped = false
      previousWhitespace = /\s/.test(char)
      continue
    }
    if (char === '\\' && quoted) escaped = true
    else if (char === '"') quoted = !quoted
    else if (!quoted && (char === '[' || char === '{')) depth += 1
    else if (!quoted && (char === ']' || char === '}'))
      depth = Math.max(0, depth - 1)
    else if (
      !quoted &&
      depth === 0 &&
      previousWhitespace &&
      (char === '#' || char === ';' || input.slice(index, index + 2) === '//')
    ) {
      return input.slice(0, index).trimEnd()
    }
    previousWhitespace = /\s/.test(char)
  }
  return input
}

function decodeString(raw: string, line: number): string {
  const value = raw.trim()
  if (!value) throw new Error(`Empty string at line ${line}`)
  if (value.startsWith('"')) {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== 'string') {
      throw new Error(`Expected quoted string at line ${line}`)
    }
    return parsed
  }
  return value
}

function decodeValue(raw: string, line: number): unknown {
  const value = raw.trim()
  const typed =
    value.startsWith('"') ||
    value.startsWith('[') ||
    value.startsWith('{') ||
    ['true', 'false', 'null'].includes(value) ||
    /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)
  if (!typed) return value
  try {
    return JSON.parse(value)
  } catch (error) {
    throw new Error(
      `Invalid JSON value at line ${line}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}

function insertUnique(
  target: ProfileObject,
  key: string,
  value: unknown,
  line: number,
) {
  if (Object.hasOwn(target, key)) {
    throw new Error(`Duplicate key ${JSON.stringify(key)} at line ${line}`)
  }
  target[key] = value
}

function applyProxyAliases(proxy: ProfileObject) {
  const rename = (from: string, to: string) => {
    if (Object.hasOwn(proxy, from)) {
      proxy[to] = proxy[from]
      delete proxy[from]
    }
  }
  rename('encrypt-method', 'cipher')
  rename('udp-relay', 'udp')
  rename('underlying-proxy', 'dialer-proxy')
  if (proxy.type === 'socks5-tls') {
    proxy.type = 'socks5'
    proxy.tls = true
  } else if (proxy.type === 'https') {
    proxy.type = 'http'
    proxy.tls = true
  }
  if (proxy.type === 'vmess') {
    rename('username', 'uuid')
    rename('sni', 'servername')
    if (typeof proxy['vmess-aead'] === 'boolean') {
      proxy.alterId = proxy['vmess-aead'] ? 0 : 1
      delete proxy['vmess-aead']
    }
  }
  rename('server-cert-fingerprint-sha256', 'fingerprint')
  const ipVersions: Record<string, string> = {
    'v4-only': 'ipv4',
    'v6-only': 'ipv6',
    'prefer-v4': 'ipv4-prefer',
    'prefer-v6': 'ipv6-prefer',
  }
  if (
    typeof proxy['ip-version'] === 'string' &&
    ipVersions[proxy['ip-version']]
  ) {
    proxy['ip-version'] = ipVersions[proxy['ip-version']]
  }
  if (proxy.ws === true) {
    proxy.network = 'ws'
    const options: ProfileObject = {}
    if (proxy['ws-path'] !== undefined) options.path = proxy['ws-path']
    if (typeof proxy['ws-headers'] === 'string') {
      const headers: ProfileObject = {}
      for (const pair of proxy['ws-headers'].split('|')) {
        const separator = pair.indexOf(':')
        if (separator > 0) {
          headers[pair.slice(0, separator).trim()] = pair
            .slice(separator + 1)
            .trim()
        }
      }
      if (Object.keys(headers).length > 0) options.headers = headers
    }
    if (Object.keys(options).length > 0) proxy['ws-opts'] = options
    delete proxy.ws
    delete proxy['ws-path']
    delete proxy['ws-headers']
  }
  if (proxy.obfs !== undefined) {
    const options: ProfileObject = { mode: proxy.obfs }
    if (proxy['obfs-host'] !== undefined) options.host = proxy['obfs-host']
    if (proxy.type === 'ss') {
      proxy.plugin = 'obfs'
      proxy['plugin-opts'] = options
    } else if (proxy.type === 'snell') {
      proxy['obfs-opts'] = options
    }
    delete proxy.obfs
    delete proxy['obfs-host']
  }
}

export function parseConfEntry(
  text: string,
  kind: ProfileEntryKind,
  line = 1,
  nativeFields = false,
): ProfileObject {
  const [rawName, rest] = splitAssignment(text.trim(), line)
  const tokens = splitTopLevel(rest, ',')
  if (tokens.length === 0)
    throw new Error(`Missing ${kind} type at line ${line}`)
  const entry: ProfileObject = {
    name: decodeString(rawName, line),
    type: decodeString(tokens[0], line),
  }
  const positional: string[] = []
  for (const token of tokens.slice(1)) {
    if (splitTopLevel(token, '=').length > 1) {
      const [rawKey, rawValue] = splitAssignment(token, line)
      insertUnique(
        entry,
        decodeString(rawKey, line),
        decodeValue(rawValue, line),
        line,
      )
    } else {
      positional.push(decodeString(token, line))
    }
  }
  if (kind === 'proxy') {
    if (positional[0] !== undefined) entry.server = positional[0]
    if (positional[1] !== undefined)
      entry.port = decodeValue(positional[1], line)
    if (positional.length > 2) {
      throw new Error(`Unexpected proxy positional value at line ${line}`)
    }
    if (!nativeFields) applyProxyAliases(entry)
  } else if (positional.length > 0) {
    entry.proxies = positional
  }
  return entry
}

function parseConfProfile(text: string): ProfileObject {
  const root: ProfileObject = {}
  const hosts: ProfileObject = {}
  const proxyProviders: ProfileObject = {}
  const ruleProviders: ProfileObject = {}
  let section = ''
  const nativeFields = text
    .trimStart()
    .startsWith(
      '# Clash Verge Surge-style profile; not a native Surge configuration.',
    )
  const allowed = new Set([
    'General',
    'Proxy',
    'Proxy Group',
    'Proxy Provider',
    'Rule Provider',
    'Rule',
    'Host',
    'Mihomo',
  ])

  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const lineNumber = index + 1
    const line = stripInlineComment(raw.trim()).trim()
    if (
      !line ||
      line.startsWith('#') ||
      line.startsWith(';') ||
      line.startsWith('//')
    ) {
      continue
    }
    const header = line.match(/^\[([^\]]+)]$/)
    if (header) {
      section = header[1]
      if (section === 'MITM' || section === 'URL Rewrite') {
        throw new Error(
          `Unsupported section [${section}] at line ${lineNumber}`,
        )
      }
      if (!allowed.has(section)) {
        throw new Error(`Unknown section [${section}] at line ${lineNumber}`)
      }
      continue
    }
    if (!section)
      throw new Error(`Content before first section at line ${lineNumber}`)

    if (section === 'General' || section === 'Mihomo' || section === 'Host') {
      const [rawKey, rawValue] = splitAssignment(line, lineNumber)
      const target = section === 'Host' ? hosts : root
      insertUnique(
        target,
        decodeString(rawKey, lineNumber),
        decodeValue(rawValue, lineNumber),
        lineNumber,
      )
    } else if (section === 'Proxy') {
      ;(root.proxies ??= [] as unknown[]) as unknown[]
      ;(root.proxies as unknown[]).push(
        parseConfEntry(line, 'proxy', lineNumber, nativeFields),
      )
    } else if (section === 'Proxy Group') {
      const group = parseConfEntry(line, 'group', lineNumber, nativeFields)
      if (!nativeFields && typeof group['policy-path'] === 'string') {
        const providerName = `${String(group.name)}-policy-path`
        const provider: ProfileObject = {
          type: 'http',
          url: group['policy-path'],
          'verge-format': 'surge',
        }
        if (group['update-interval'] !== undefined) {
          provider.interval = group['update-interval']
          delete group['update-interval']
        }
        delete group['policy-path']
        insertUnique(proxyProviders, providerName, provider, lineNumber)
        group.use = [providerName]
      }
      ;(root['proxy-groups'] ??= [] as unknown[]) as unknown[]
      ;(root['proxy-groups'] as unknown[]).push(group)
    } else if (section === 'Proxy Provider' || section === 'Rule Provider') {
      const parsed = parseConfEntry(line, 'proxy', lineNumber, nativeFields)
      const name = String(parsed.name)
      delete parsed.name
      delete parsed.server
      delete parsed.port
      const target =
        section === 'Proxy Provider' ? proxyProviders : ruleProviders
      insertUnique(target, name, parsed, lineNumber)
    } else if (section === 'Rule') {
      ;(root.rules ??= [] as unknown[]) as unknown[]
      ;(root.rules as unknown[]).push(
        line.startsWith('"') ? decodeString(line, lineNumber) : line,
      )
    }
  }
  if (Object.keys(proxyProviders).length > 0)
    root['proxy-providers'] = proxyProviders
  if (Object.keys(ruleProviders).length > 0)
    root['rule-providers'] = ruleProviders
  if (Object.keys(hosts).length > 0) root.hosts = hosts
  return root
}

function safeBare(value: string): boolean {
  return (
    Boolean(value) &&
    !['true', 'false', 'null'].includes(value) &&
    !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value) &&
    /^[\p{L}\p{N} _./:@+-]+$/u.test(value) &&
    !value.startsWith('#') &&
    !value.startsWith(';') &&
    !value.startsWith('//') &&
    !value.includes(',') &&
    !value.includes('=')
  )
}

function encodeString(value: string): string {
  return safeBare(value) ? value : JSON.stringify(value)
}

function encodeValue(value: unknown, path: string): string {
  if (typeof value === 'string') return encodeString(value)
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new Error(`Unsupported value at ${path}`)
  return encoded
}

export function stringifyConfEntry(
  entry: ProfileObject,
  kind: ProfileEntryKind,
  path = '$',
): string {
  if (typeof entry.name !== 'string' || typeof entry.type !== 'string') {
    throw new Error(`Missing string name or type at ${path}`)
  }
  const tokens = [encodeString(entry.type)]
  const skipped = new Set(['name', 'type'])
  if (kind === 'proxy') {
    if (entry.server !== undefined) {
      tokens.push(encodeValue(entry.server, `${path}.server`))
      skipped.add('server')
    }
    if (entry.port !== undefined) {
      tokens.push(encodeValue(entry.port, `${path}.port`))
      skipped.add('port')
    }
  } else if (entry.proxies !== undefined) {
    if (!Array.isArray(entry.proxies))
      throw new Error(`proxies must be an array at ${path}`)
    if (entry.proxies.length === 0) {
      tokens.push('proxies=[]')
    } else {
      tokens.push(...entry.proxies.map((item) => encodeString(String(item))))
    }
    skipped.add('proxies')
  }
  for (const [key, value] of Object.entries(entry)) {
    if (skipped.has(key)) continue
    tokens.push(`${encodeString(key)}=${encodeValue(value, `${path}.${key}`)}`)
  }
  return `${encodeString(entry.name)} = ${tokens.join(', ')}`
}

function pushSection(output: string[], name: string, lines: string[]) {
  if (lines.length === 0) return
  if (output.length > 0 && output.at(-1) !== '') output.push('')
  output.push(`[${name}]`, ...lines)
}

function stringifyConfProfile(root: ProfileObject): string {
  const output = [
    '# Clash Verge Surge-style profile; not a native Surge configuration.',
  ]
  const general: string[] = []
  const mihomo: string[] = []
  for (const [key, value] of Object.entries(root)) {
    if (SPECIAL_KEYS.has(key)) {
      const empty =
        (Array.isArray(value) && value.length === 0) ||
        (isObject(value) && Object.keys(value).length === 0)
      if (empty) {
        mihomo.push(`${encodeString(key)} = ${encodeValue(value, `$.${key}`)}`)
      }
      continue
    }
    const line = `${encodeString(key)} = ${encodeValue(value, `$.${key}`)}`
    if (
      value === null ||
      ['boolean', 'number', 'string'].includes(typeof value)
    ) {
      general.push(line)
    } else {
      mihomo.push(line)
    }
  }
  pushSection(output, 'General', general)
  pushSection(
    output,
    'Proxy',
    Array.isArray(root.proxies)
      ? root.proxies.map((entry, index) =>
          stringifyConfEntry(
            entry as ProfileObject,
            'proxy',
            `$.proxies[${index}]`,
          ),
        )
      : [],
  )
  pushSection(
    output,
    'Proxy Group',
    Array.isArray(root['proxy-groups'])
      ? root['proxy-groups'].map((entry, index) =>
          stringifyConfEntry(
            entry as ProfileObject,
            'group',
            `$.proxy-groups[${index}]`,
          ),
        )
      : [],
  )
  for (const [section, key] of [
    ['Proxy Provider', 'proxy-providers'],
    ['Rule Provider', 'rule-providers'],
  ] as const) {
    const providers = root[key]
    pushSection(
      output,
      section,
      isObject(providers)
        ? Object.entries(providers).map(([name, value]) =>
            stringifyConfEntry(
              { ...(value as ProfileObject), name },
              'proxy',
              `$.${key}.${name}`,
            ),
          )
        : [],
    )
  }
  pushSection(
    output,
    'Rule',
    Array.isArray(root.rules)
      ? root.rules.map((rule) => {
          const value = String(rule)
          return value.startsWith('#') ||
            value.startsWith(';') ||
            value.startsWith('//') ||
            value.startsWith('[')
            ? JSON.stringify(value)
            : value
        })
      : [],
  )
  pushSection(
    output,
    'Host',
    isObject(root.hosts)
      ? Object.entries(root.hosts).map(
          ([key, value]) =>
            `${encodeString(key)} = ${encodeValue(value, `$.hosts.${key}`)}`,
        )
      : [],
  )
  pushSection(output, 'Mihomo', mihomo)
  return `${output.join('\n')}\n`
}

export function parseProfileContent(
  text: string,
  format: ProfileFormat,
): unknown {
  return format === 'conf' ? parseConfProfile(text) : yaml.load(text)
}

export function stringifyProfileContent(
  value: unknown,
  format: ProfileFormat,
): string {
  if (!isObject(value)) throw new Error('Profile root must be an object')
  return format === 'conf'
    ? stringifyConfProfile(value)
    : yaml.dump(value, { forceQuotes: true })
}

export function profileEditorLanguage(format: ProfileFormat) {
  return format === 'conf' ? 'surge-conf' : 'yaml'
}
