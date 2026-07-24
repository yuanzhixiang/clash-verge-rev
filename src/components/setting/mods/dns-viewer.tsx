import { invoke } from '@tauri-apps/api/core'
import { useLockFn } from 'ahooks'
import yaml from 'js-yaml'
import { RotateCcw } from 'lucide-react'
import { useTheme } from 'next-themes'
import type { ReactNode, Ref } from 'react'
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useReducer,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import {
  BaseDialog,
  BaseStyledSelect,
  DialogRef,
  MonacoEditor,
  Switch,
} from '@/components/base'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SelectItem } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useClash } from '@/hooks/use-clash'
import { showNotice } from '@/services/notice-service'
import type { MonacoEditorInstance } from '@/types/monaco'
import getSystem from '@/utils/get-system'

function Item({ children, column }: { children: ReactNode; column?: boolean }) {
  return (
    <div
      className={
        column
          ? 'flex flex-col items-start gap-component px-adjust py-[5px]'
          : 'flex items-center justify-between px-adjust py-[5px]'
      }
    >
      {children}
    </div>
  )
}

function ItemText({
  primary,
  secondary,
}: {
  primary: ReactNode
  secondary?: ReactNode
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[var(--color-text-primary)]">{primary}</span>
      {secondary != null && (
        <span className="text-body text-[var(--color-text-secondary)]">
          {secondary}
        </span>
      )}
    </div>
  )
}

const TEXTAREA_CLASS = 'w-full resize-y text-body leading-normal'

type NameserverPolicy = Record<string, any>

function parseNameserverPolicy(str: string): NameserverPolicy {
  const result: NameserverPolicy = {}
  if (!str) return result

  const ruleRegex = /\s*([^=]+?)\s*=\s*([^,]+)(?:,|$)/g
  let match: RegExpExecArray | null

  while ((match = ruleRegex.exec(str)) !== null) {
    const [, domainsPart, serversPart] = match

    const domains = [domainsPart.trim()]
    const servers = serversPart.split(';').map((s) => s.trim())

    domains.forEach((domain) => {
      result[domain] = servers
    })
  }

  return result
}

function formatNameserverPolicy(policy: unknown): string {
  if (!policy || typeof policy !== 'object') return ''

  return Object.entries(policy as Record<string, unknown>)
    .map(([domain, servers]) => {
      const serversStr = Array.isArray(servers) ? servers.join(';') : servers
      return `${domain}=${serversStr}`
    })
    .join(', ')
}

function formatHosts(hosts: unknown): string {
  if (!hosts || typeof hosts !== 'object') return ''

  const result: string[] = []

  Object.entries(hosts as Record<string, unknown>).forEach(
    ([domain, value]) => {
      if (Array.isArray(value)) {
        const ipsStr = value.join(';')
        result.push(`${domain}=${ipsStr}`)
      } else {
        result.push(`${domain}=${value}`)
      }
    },
  )

  return result.join(', ')
}

function parseHosts(str: string): NameserverPolicy {
  const result: NameserverPolicy = {}
  if (!str) return result

  str.split(',').forEach((item) => {
    const parts = item.trim().split('=')
    if (parts.length < 2) return

    const domain = parts[0].trim()
    const valueStr = parts.slice(1).join('=').trim()

    if (valueStr.includes(';')) {
      result[domain] = valueStr
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
    } else {
      result[domain] = valueStr
    }
  })

  return result
}

function parseList(str: string): string[] {
  if (!str?.trim()) return []
  return str
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

// 默认DNS配置
const DEFAULT_DNS_CONFIG = {
  enable: true,
  listen: ':53',
  'enhanced-mode': 'fake-ip' as 'fake-ip' | 'redir-host',
  'fake-ip-range': '198.18.0.1/16',
  'fake-ip-range6': 'fdfe:dcba:9876::1/64',
  'fake-ip-filter-mode': 'blacklist' as 'blacklist' | 'whitelist',
  'prefer-h3': false,
  'respect-rules': false,
  'use-hosts': false,
  'use-system-hosts': false,
  ipv6: true,
  'fake-ip-filter': [
    '*.lan',
    '*.local',
    '*.arpa',
    'time.*.com',
    'ntp.*.com',
    'time.*.com',
    '+.market.xiaomi.com',
    'localhost.ptlogin2.qq.com',
    '*.msftncsi.com',
    'www.msftconnecttest.com',
  ],
  'default-nameserver': [
    'system',
    '223.6.6.6',
    '8.8.8.8',
    '2400:3200::1',
    '2001:4860:4860::8888',
  ],
  nameserver: [
    '8.8.8.8',
    'https://doh.pub/dns-query',
    'https://dns.alidns.com/dns-query',
  ],
  fallback: [],
  'nameserver-policy': {},
  'proxy-server-nameserver': [
    'https://doh.pub/dns-query',
    'https://dns.alidns.com/dns-query',
    'tls://223.5.5.5',
  ],
  'direct-nameserver': [],
  'direct-nameserver-follow-policy': false,
  'fallback-filter': {
    geoip: true,
    'geoip-code': 'CN',
    ipcidr: ['240.0.0.0/4', '0.0.0.0/32'],
    domain: ['+.google.com', '+.facebook.com', '+.youtube.com'],
  },
}

export function DnsViewer({ ref }: { ref?: Ref<DialogRef> }) {
  const { t } = useTranslation()
  const { clash, mutateClash } = useClash()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const [open, setOpen] = useState(false)
  const [visualization, setVisualization] = useState(true)
  const skipYamlSyncRef = useRef(false)
  const editorRef = useRef<MonacoEditorInstance | null>(null)
  const [values, setValues] = useState<{
    enable: boolean
    listen: string
    enhancedMode: 'fake-ip' | 'redir-host'
    fakeIpRange: string
    fakeIpRange6: string
    fakeIpFilterMode: 'blacklist' | 'whitelist'
    preferH3: boolean
    respectRules: boolean
    useHosts: boolean
    useSystemHosts: boolean
    ipv6: boolean
    fakeIpFilter: string
    nameserver: string
    fallback: string
    defaultNameserver: string
    proxyServerNameserver: string
    directNameserver: string
    directNameserverFollowPolicy: boolean
    fallbackGeoip: boolean
    fallbackGeoipCode: string
    fallbackIpcidr: string
    fallbackDomain: string
    nameserverPolicy: string
    hosts: string // hosts设置，独立于dns
  }>({
    enable: DEFAULT_DNS_CONFIG.enable,
    listen: DEFAULT_DNS_CONFIG.listen,
    enhancedMode: DEFAULT_DNS_CONFIG['enhanced-mode'],
    fakeIpRange: DEFAULT_DNS_CONFIG['fake-ip-range'],
    fakeIpRange6: DEFAULT_DNS_CONFIG['fake-ip-range6'],
    fakeIpFilterMode: DEFAULT_DNS_CONFIG['fake-ip-filter-mode'],
    preferH3: DEFAULT_DNS_CONFIG['prefer-h3'],
    respectRules: DEFAULT_DNS_CONFIG['respect-rules'],
    useHosts: DEFAULT_DNS_CONFIG['use-hosts'],
    useSystemHosts: DEFAULT_DNS_CONFIG['use-system-hosts'],
    ipv6: DEFAULT_DNS_CONFIG.ipv6,
    fakeIpFilter: DEFAULT_DNS_CONFIG['fake-ip-filter'].join(', '),
    defaultNameserver: DEFAULT_DNS_CONFIG['default-nameserver'].join(', '),
    nameserver: DEFAULT_DNS_CONFIG.nameserver.join(', '),
    fallback: DEFAULT_DNS_CONFIG.fallback.join(', '),
    proxyServerNameserver:
      DEFAULT_DNS_CONFIG['proxy-server-nameserver']?.join(', ') || '',
    directNameserver: DEFAULT_DNS_CONFIG['direct-nameserver']?.join(', ') || '',
    directNameserverFollowPolicy:
      DEFAULT_DNS_CONFIG['direct-nameserver-follow-policy'] || false,
    fallbackGeoip: DEFAULT_DNS_CONFIG['fallback-filter'].geoip,
    fallbackGeoipCode: DEFAULT_DNS_CONFIG['fallback-filter']['geoip-code'],
    fallbackIpcidr:
      DEFAULT_DNS_CONFIG['fallback-filter'].ipcidr?.join(', ') || '',
    fallbackDomain:
      DEFAULT_DNS_CONFIG['fallback-filter'].domain?.join(', ') || '',
    nameserverPolicy: '',
    hosts: '',
  })

  // 用于YAML编辑模式
  const [yamlContent, setYamlContent] = useReducer(
    (_: string, next: string) => next,
    '',
  )

  // 从配置对象更新表单值
  const updateValuesFromConfig = useCallback(
    (config: any) => {
      if (!config) return

      const dnsConfig = config.dns || {}
      const hostsConfig = config.hosts || {}

      const enhancedMode =
        dnsConfig['enhanced-mode'] || DEFAULT_DNS_CONFIG['enhanced-mode']
      const validEnhancedMode =
        enhancedMode === 'fake-ip' || enhancedMode === 'redir-host'
          ? enhancedMode
          : DEFAULT_DNS_CONFIG['enhanced-mode']

      const fakeIpFilterMode =
        dnsConfig['fake-ip-filter-mode'] ||
        DEFAULT_DNS_CONFIG['fake-ip-filter-mode']
      const validFakeIpFilterMode =
        fakeIpFilterMode === 'blacklist' || fakeIpFilterMode === 'whitelist'
          ? fakeIpFilterMode
          : DEFAULT_DNS_CONFIG['fake-ip-filter-mode']

      setValues({
        enable: dnsConfig.enable ?? DEFAULT_DNS_CONFIG.enable,
        listen: dnsConfig.listen ?? DEFAULT_DNS_CONFIG.listen,
        enhancedMode: validEnhancedMode,
        fakeIpRange:
          dnsConfig['fake-ip-range'] ?? DEFAULT_DNS_CONFIG['fake-ip-range'],
        fakeIpRange6:
          dnsConfig['fake-ip-range6'] ?? DEFAULT_DNS_CONFIG['fake-ip-range6'],
        fakeIpFilterMode: validFakeIpFilterMode,
        preferH3: dnsConfig['prefer-h3'] ?? DEFAULT_DNS_CONFIG['prefer-h3'],
        respectRules:
          dnsConfig['respect-rules'] ?? DEFAULT_DNS_CONFIG['respect-rules'],
        useHosts: dnsConfig['use-hosts'] ?? DEFAULT_DNS_CONFIG['use-hosts'],
        useSystemHosts:
          dnsConfig['use-system-hosts'] ??
          DEFAULT_DNS_CONFIG['use-system-hosts'],
        ipv6: dnsConfig.ipv6 ?? DEFAULT_DNS_CONFIG.ipv6,
        fakeIpFilter:
          dnsConfig['fake-ip-filter']?.join(', ') ??
          DEFAULT_DNS_CONFIG['fake-ip-filter'].join(', '),
        nameserver:
          dnsConfig.nameserver?.join(', ') ??
          DEFAULT_DNS_CONFIG.nameserver.join(', '),
        fallback:
          dnsConfig.fallback?.join(', ') ??
          DEFAULT_DNS_CONFIG.fallback.join(', '),
        defaultNameserver:
          dnsConfig['default-nameserver']?.join(', ') ??
          DEFAULT_DNS_CONFIG['default-nameserver'].join(', '),
        proxyServerNameserver:
          dnsConfig['proxy-server-nameserver']?.join(', ') ??
          (DEFAULT_DNS_CONFIG['proxy-server-nameserver']?.join(', ') || ''),
        directNameserver:
          dnsConfig['direct-nameserver']?.join(', ') ??
          (DEFAULT_DNS_CONFIG['direct-nameserver']?.join(', ') || ''),
        directNameserverFollowPolicy:
          dnsConfig['direct-nameserver-follow-policy'] ??
          DEFAULT_DNS_CONFIG['direct-nameserver-follow-policy'],
        fallbackGeoip:
          dnsConfig['fallback-filter']?.geoip ??
          DEFAULT_DNS_CONFIG['fallback-filter'].geoip,
        fallbackGeoipCode:
          dnsConfig['fallback-filter']?.['geoip-code'] ??
          DEFAULT_DNS_CONFIG['fallback-filter']['geoip-code'],
        fallbackIpcidr:
          dnsConfig['fallback-filter']?.ipcidr?.join(', ') ??
          DEFAULT_DNS_CONFIG['fallback-filter'].ipcidr.join(', '),
        fallbackDomain:
          dnsConfig['fallback-filter']?.domain?.join(', ') ??
          DEFAULT_DNS_CONFIG['fallback-filter'].domain.join(', '),
        nameserverPolicy:
          formatNameserverPolicy(dnsConfig['nameserver-policy']) || '',
        hosts: formatHosts(hostsConfig) || '',
      })
    },
    [setValues],
  )

  const generateDnsConfig = useCallback(() => {
    const dnsConfig: any = {
      enable: values.enable,
      listen: values.listen,
      'enhanced-mode': values.enhancedMode,
      'fake-ip-range': values.fakeIpRange,
      'fake-ip-range6':
        values.fakeIpRange6 || DEFAULT_DNS_CONFIG['fake-ip-range6'],
      'fake-ip-filter-mode': values.fakeIpFilterMode,
      'prefer-h3': values.preferH3,
      'respect-rules': values.respectRules,
      'use-hosts': values.useHosts,
      'use-system-hosts': values.useSystemHosts,
      ipv6: values.ipv6,
      'fake-ip-filter': parseList(values.fakeIpFilter),
      'default-nameserver': parseList(values.defaultNameserver),
      nameserver: parseList(values.nameserver),
      'direct-nameserver-follow-policy': values.directNameserverFollowPolicy,
      'fallback-filter': {
        geoip: values.fallbackGeoip,
        'geoip-code': values.fallbackGeoipCode,
        ipcidr: parseList(values.fallbackIpcidr),
        domain: parseList(values.fallbackDomain),
      },

      fallback: parseList(values.fallback),
      'proxy-server-nameserver': parseList(values.proxyServerNameserver),
      'direct-nameserver': parseList(values.directNameserver),
    }

    const policy = parseNameserverPolicy(values.nameserverPolicy)
    if (Object.keys(policy).length > 0) {
      dnsConfig['nameserver-policy'] = policy
    }

    return dnsConfig
  }, [values])

  const updateYamlFromValues = useCallback(() => {
    const config: Record<string, any> = {}

    const dnsConfig = generateDnsConfig()
    if (Object.keys(dnsConfig).length > 0) {
      config.dns = dnsConfig
    }

    const hosts = parseHosts(values.hosts)
    if (Object.keys(hosts).length > 0) {
      config.hosts = hosts
    }

    setYamlContent(yaml.dump(config, { forceQuotes: true }))
  }, [generateDnsConfig, setYamlContent, values.hosts])

  // 重置为默认值
  const resetToDefaults = useCallback(() => {
    setValues({
      enable: DEFAULT_DNS_CONFIG.enable,
      listen: DEFAULT_DNS_CONFIG.listen,
      enhancedMode: DEFAULT_DNS_CONFIG['enhanced-mode'],
      fakeIpRange: DEFAULT_DNS_CONFIG['fake-ip-range'],
      fakeIpRange6: DEFAULT_DNS_CONFIG['fake-ip-range6'],
      fakeIpFilterMode: DEFAULT_DNS_CONFIG['fake-ip-filter-mode'],
      preferH3: DEFAULT_DNS_CONFIG['prefer-h3'],
      respectRules: DEFAULT_DNS_CONFIG['respect-rules'],
      useHosts: DEFAULT_DNS_CONFIG['use-hosts'],
      useSystemHosts: DEFAULT_DNS_CONFIG['use-system-hosts'],
      ipv6: DEFAULT_DNS_CONFIG.ipv6,
      fakeIpFilter: DEFAULT_DNS_CONFIG['fake-ip-filter'].join(', '),
      defaultNameserver: DEFAULT_DNS_CONFIG['default-nameserver'].join(', '),
      nameserver: DEFAULT_DNS_CONFIG.nameserver.join(', '),
      fallback: DEFAULT_DNS_CONFIG.fallback.join(', '),
      proxyServerNameserver:
        DEFAULT_DNS_CONFIG['proxy-server-nameserver']?.join(', ') || '',
      directNameserver:
        DEFAULT_DNS_CONFIG['direct-nameserver']?.join(', ') || '',
      directNameserverFollowPolicy:
        DEFAULT_DNS_CONFIG['direct-nameserver-follow-policy'] || false,
      fallbackGeoip: DEFAULT_DNS_CONFIG['fallback-filter'].geoip,
      fallbackGeoipCode: DEFAULT_DNS_CONFIG['fallback-filter']['geoip-code'],
      fallbackIpcidr:
        DEFAULT_DNS_CONFIG['fallback-filter'].ipcidr?.join(', ') || '',
      fallbackDomain:
        DEFAULT_DNS_CONFIG['fallback-filter'].domain?.join(', ') || '',
      nameserverPolicy: '',
      hosts: '',
    })

    updateYamlFromValues()
  }, [setValues, updateYamlFromValues])

  // 从YAML更新表单值
  const updateValuesFromYaml = useCallback(() => {
    try {
      const parsedYaml = yaml.load(yamlContent) as any
      if (!parsedYaml) return

      skipYamlSyncRef.current = true
      updateValuesFromConfig(parsedYaml)
    } catch {
      showNotice.error('settings.modals.dns.errors.invalidYaml')
    }
  }, [yamlContent, updateValuesFromConfig])

  useEffect(() => {
    if (skipYamlSyncRef.current) {
      skipYamlSyncRef.current = false
      return
    }
    updateYamlFromValues()
  }, [updateYamlFromValues])

  const latestUpdateValuesFromYamlRef = useRef(updateValuesFromYaml)
  const latestUpdateYamlFromValuesRef = useRef(updateYamlFromValues)

  useEffect(() => {
    latestUpdateValuesFromYamlRef.current = updateValuesFromYaml
    latestUpdateYamlFromValuesRef.current = updateYamlFromValues
  }, [updateValuesFromYaml, updateYamlFromValues])

  useEffect(() => {
    if (visualization) {
      latestUpdateValuesFromYamlRef.current()
    } else {
      latestUpdateYamlFromValuesRef.current()
    }
  }, [visualization])

  useEffect(() => {
    return () => {
      editorRef.current?.dispose()
      editorRef.current = null
    }
  }, [])

  const initDnsConfig = useCallback(async () => {
    try {
      const dnsConfigExists = await invoke<boolean>(
        'check_dns_config_exists',
        {},
      )

      if (dnsConfigExists) {
        const dnsConfig = await invoke<string>('get_dns_config_content', {})
        const config = yaml.load(dnsConfig) as any

        updateValuesFromConfig(config)
        setYamlContent(dnsConfig)
      } else {
        resetToDefaults()
      }
    } catch (err) {
      console.error('Failed to initialize DNS config', err)
      resetToDefaults()
    }
  }, [resetToDefaults, setYamlContent, updateValuesFromConfig])

  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        setOpen(true)
        void initDnsConfig()
      },
      close: () => setOpen(false),
    }),
    [initDnsConfig],
  )

  // 生成DNS配置对象
  // 处理保存操作
  const onSave = useLockFn(async () => {
    try {
      let config: Record<string, any>

      if (visualization) {
        // 使用表单值生成配置
        config = {}

        const dnsConfig = generateDnsConfig()
        if (Object.keys(dnsConfig).length > 0) {
          config.dns = dnsConfig
        }

        const hosts = parseHosts(values.hosts)
        if (Object.keys(hosts).length > 0) {
          config.hosts = hosts
        }
      } else {
        // 使用YAML编辑器的值
        const parsedConfig = yaml.load(yamlContent)
        if (typeof parsedConfig !== 'object' || parsedConfig === null) {
          throw new Error(t('settings.modals.dns.errors.invalid'))
        }
        config = parsedConfig as Record<string, any>
      }

      // 保存配置
      await invoke('save_dns_config', { dnsConfig: config })

      // 验证配置
      const validation = await invoke<ValidationOutcome>(
        'validate_dns_config',
        {},
      )

      if (validation.status !== 'valid') {
        const errorMsg =
          validation.status === 'invalid'
            ? validation.message
            : 'Configuration validation skipped'
        let cleanErrorMsg = errorMsg

        // 提取关键错误信息
        if (errorMsg.includes('level=error')) {
          const errorLines = errorMsg
            .split('\n')
            .filter(
              (line) =>
                line.includes('level=error') ||
                line.includes('level=fatal') ||
                line.includes('failed'),
            )

          if (errorLines.length > 0) {
            cleanErrorMsg = errorLines
              .map((line) => {
                const msgMatch = line.match(/msg="([^"]+)"/)
                return msgMatch ? msgMatch[1] : line
              })
              .join(', ')
          }
        }

        showNotice.error(
          'settings.modals.dns.messages.configError',
          cleanErrorMsg,
        )
        return
      }

      // 如果DNS开关当前是打开的，则需要应用新的DNS配置
      if (clash?.dns?.enable) {
        await invoke('apply_dns_config', { apply: true })
        mutateClash()
      }

      setOpen(false)
      showNotice.success('settings.modals.dns.messages.saved')
    } catch (err) {
      showNotice.error(err)
    }
  })

  // YAML编辑器内容变更处理
  const handleYamlChange = (value?: string) => {
    setYamlContent(value || '')
  }

  // 处理表单值变化
  const handleChange = (field: string) => (event: any) => {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value

    setValues((prev) => {
      const newValues = {
        ...prev,
        [field]: value,
      }

      // 当可视化编辑模式下的值变化时，自动更新YAML
      if (visualization) {
        setTimeout(() => {
          updateYamlFromValues()
        }, 0)
      }

      return newValues
    })
  }

  // Switch 使用 shadcn 的 onCheckedChange(boolean)，此处适配回 handleChange 的事件形态
  const handleSwitchChange = (field: string) => (checked: boolean) =>
    handleChange(field)({ target: { type: 'checkbox', checked } })

  return (
    <BaseDialog
      open={open}
      disableEnforceFocus={!visualization}
      title={
        <div className="flex items-center justify-between">
          {t('settings.modals.dns.dialog.title')}
          <div className="flex items-center gap-component">
            <Button
              variant="outline"
              size="sm"
              className="border-[var(--color-warning)] text-[var(--color-warning)] hover:bg-[var(--color-warning-subtle)]"
              onClick={resetToDefaults}
            >
              <RotateCcw />
              {t('shared.actions.resetToDefault')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setVisualization((prev) => !prev)
              }}
            >
              {visualization
                ? t('shared.editorModes.advanced')
                : t('shared.editorModes.visualization')}
            </Button>
          </div>
        </div>
      }
      contentSx={{
        width: 550,
        overflow: 'auto',
        ...(visualization
          ? {}
          : { padding: '0 24px', display: 'flex', flexDirection: 'column' }),
      }}
      okBtn={t('shared.actions.save')}
      cancelBtn={t('shared.actions.cancel')}
      onClose={() => setOpen(false)}
      onCancel={() => setOpen(false)}
      onOk={onSave}
    >
      {/* Warning message */}
      <p className="mt-0 mb-inset text-body italic text-[var(--color-warning)]">
        {t('settings.modals.dns.dialog.warning')}
      </p>

      {visualization ? (
        <div>
          <p className="mt-component mb-component text-body-lg font-bold">
            {t('settings.modals.dns.sections.general')}
          </p>

          <Item>
            <ItemText primary={t('settings.modals.dns.fields.enable')} />
            <Switch
              checked={values.enable}
              onCheckedChange={handleSwitchChange('enable')}
            />
          </Item>

          <Item>
            <ItemText primary={t('settings.modals.dns.fields.listen')} />
            <Input
              className="w-[150px]"
              autoComplete="off"
              spellCheck={false}
              value={values.listen}
              onChange={handleChange('listen')}
              placeholder=":53"
            />
          </Item>

          <Item>
            <ItemText primary={t('settings.modals.dns.fields.enhancedMode')} />
            <BaseStyledSelect
              className="w-[150px]"
              value={values.enhancedMode}
              onChange={handleChange('enhancedMode')}
            >
              <SelectItem value="fake-ip">fake-ip</SelectItem>
              <SelectItem value="redir-host">redir-host</SelectItem>
            </BaseStyledSelect>
          </Item>

          <Item>
            <ItemText primary={t('settings.modals.dns.fields.fakeIpRange')} />
            <Input
              className="w-[150px]"
              autoComplete="off"
              spellCheck={false}
              value={values.fakeIpRange}
              onChange={handleChange('fakeIpRange')}
              placeholder="198.18.0.1/16"
            />
          </Item>

          <Item>
            <ItemText primary={t('settings.modals.dns.fields.fakeIpRange6')} />
            <Input
              className="w-[200px]"
              autoComplete="off"
              spellCheck={false}
              value={values.fakeIpRange6}
              onChange={handleChange('fakeIpRange6')}
              placeholder="fdfe:dcba:9876::1/64"
            />
          </Item>

          <Item>
            <ItemText
              primary={t('settings.modals.dns.fields.fakeIpFilterMode')}
            />
            <BaseStyledSelect
              className="w-[150px]"
              value={values.fakeIpFilterMode}
              onChange={handleChange('fakeIpFilterMode')}
            >
              <SelectItem value="blacklist">blacklist</SelectItem>
              <SelectItem value="whitelist">whitelist</SelectItem>
            </BaseStyledSelect>
          </Item>

          <Item>
            <ItemText
              primary={t('settings.modals.dns.fields.ipv6.label')}
              secondary={t('settings.modals.dns.fields.ipv6.description')}
            />
            <Switch
              checked={values.ipv6}
              onCheckedChange={handleSwitchChange('ipv6')}
            />
          </Item>

          <Item>
            <ItemText
              primary={t('settings.modals.dns.fields.preferH3.label')}
              secondary={t('settings.modals.dns.fields.preferH3.description')}
            />
            <Switch
              checked={values.preferH3}
              onCheckedChange={handleSwitchChange('preferH3')}
            />
          </Item>

          <Item>
            <ItemText
              primary={t('settings.modals.dns.fields.respectRules.label')}
              secondary={t(
                'settings.modals.dns.fields.respectRules.description',
              )}
            />
            <Switch
              checked={values.respectRules}
              onCheckedChange={handleSwitchChange('respectRules')}
            />
          </Item>

          <Item>
            <ItemText
              primary={t('settings.modals.dns.fields.useHosts.label')}
              secondary={t('settings.modals.dns.fields.useHosts.description')}
            />
            <Switch
              checked={values.useHosts}
              onCheckedChange={handleSwitchChange('useHosts')}
            />
          </Item>

          <Item>
            <ItemText
              primary={t('settings.modals.dns.fields.useSystemHosts.label')}
              secondary={t(
                'settings.modals.dns.fields.useSystemHosts.description',
              )}
            />
            <Switch
              checked={values.useSystemHosts}
              onCheckedChange={handleSwitchChange('useSystemHosts')}
            />
          </Item>

          <Item>
            <ItemText
              primary={t('settings.modals.dns.fields.directPolicy.label')}
              secondary={t(
                'settings.modals.dns.fields.directPolicy.description',
              )}
            />
            <Switch
              checked={values.directNameserverFollowPolicy}
              onCheckedChange={handleSwitchChange(
                'directNameserverFollowPolicy',
              )}
            />
          </Item>

          <Item column>
            <ItemText
              primary={t('settings.modals.dns.fields.defaultNameserver.label')}
              secondary={t(
                'settings.modals.dns.fields.defaultNameserver.description',
              )}
            />
            <Textarea
              className={TEXTAREA_CLASS}
              spellCheck={false}
              value={values.defaultNameserver}
              onChange={handleChange('defaultNameserver')}
              placeholder="system,223.6.6.6, 8.8.8.8, 2400:3200::1, 2001:4860:4860::8888"
            />
          </Item>

          <Item column>
            <ItemText
              primary={t('settings.modals.dns.fields.nameserver.label')}
              secondary={t('settings.modals.dns.fields.nameserver.description')}
            />
            <Textarea
              className={TEXTAREA_CLASS}
              spellCheck={false}
              value={values.nameserver}
              onChange={handleChange('nameserver')}
              placeholder="8.8.8.8, https://doh.pub/dns-query, https://dns.alidns.com/dns-query"
            />
          </Item>

          <Item column>
            <ItemText
              primary={t('settings.modals.dns.fields.fallback.label')}
              secondary={t('settings.modals.dns.fields.fallback.description')}
            />
            <Textarea
              className={TEXTAREA_CLASS}
              spellCheck={false}
              value={values.fallback}
              onChange={handleChange('fallback')}
              placeholder="https://dns.alidns.com/dns-query, https://dns.google/dns-query, https://cloudflare-dns.com/dns-query"
            />
          </Item>

          <Item column>
            <ItemText
              primary={t('settings.modals.dns.fields.proxy.label')}
              secondary={t('settings.modals.dns.fields.proxy.description')}
            />
            <Textarea
              className={TEXTAREA_CLASS}
              spellCheck={false}
              value={values.proxyServerNameserver}
              onChange={handleChange('proxyServerNameserver')}
              placeholder="https://doh.pub/dns-query, https://dns.alidns.com/dns-query"
            />
          </Item>

          <Item column>
            <ItemText
              primary={t('settings.modals.dns.fields.directNameserver.label')}
              secondary={t(
                'settings.modals.dns.fields.directNameserver.description',
              )}
            />
            <Textarea
              className={TEXTAREA_CLASS}
              spellCheck={false}
              value={values.directNameserver}
              onChange={handleChange('directNameserver')}
              placeholder="system, 223.6.6.6"
            />
          </Item>

          <Item column>
            <ItemText
              primary={t('settings.modals.dns.fields.fakeIpFilter.label')}
              secondary={t(
                'settings.modals.dns.fields.fakeIpFilter.description',
              )}
            />
            <Textarea
              className={TEXTAREA_CLASS}
              spellCheck={false}
              value={values.fakeIpFilter}
              onChange={handleChange('fakeIpFilter')}
              placeholder="*.lan, *.local, localhost.ptlogin2.qq.com"
            />
          </Item>

          <Item column>
            <ItemText
              primary={t('settings.modals.dns.fields.nameserverPolicy.label')}
              secondary={t(
                'settings.modals.dns.fields.nameserverPolicy.description',
              )}
            />
            <Textarea
              className={TEXTAREA_CLASS}
              spellCheck={false}
              value={values.nameserverPolicy}
              onChange={handleChange('nameserverPolicy')}
              placeholder="+.arpa=10.0.0.1, rule-set:cn=https://doh.pub/dns-query;https://dns.alidns.com/dns-query"
            />
          </Item>

          <p className="mt-inset mb-component text-body font-bold">
            {t('settings.modals.dns.sections.fallbackFilter')}
          </p>

          <Item>
            <ItemText
              primary={t('settings.modals.dns.fields.geoipFiltering.label')}
              secondary={t(
                'settings.modals.dns.fields.geoipFiltering.description',
              )}
            />
            <Switch
              checked={values.fallbackGeoip}
              onCheckedChange={handleSwitchChange('fallbackGeoip')}
            />
          </Item>

          <Item>
            <ItemText primary={t('settings.modals.dns.fields.geoipCode')} />
            <Input
              className="w-[100px]"
              autoComplete="off"
              spellCheck={false}
              value={values.fallbackGeoipCode}
              onChange={handleChange('fallbackGeoipCode')}
              placeholder="CN"
            />
          </Item>

          <Item column>
            <ItemText
              primary={t('settings.modals.dns.fields.fallbackIpCidr.label')}
              secondary={t(
                'settings.modals.dns.fields.fallbackIpCidr.description',
              )}
            />
            <Textarea
              className={TEXTAREA_CLASS}
              spellCheck={false}
              value={values.fallbackIpcidr}
              onChange={handleChange('fallbackIpcidr')}
              placeholder="240.0.0.0/4, 127.0.0.1/8"
            />
          </Item>

          <Item column>
            <ItemText
              primary={t('settings.modals.dns.fields.fallbackDomain.label')}
              secondary={t(
                'settings.modals.dns.fields.fallbackDomain.description',
              )}
            />
            <Textarea
              className={TEXTAREA_CLASS}
              spellCheck={false}
              value={values.fallbackDomain}
              onChange={handleChange('fallbackDomain')}
              placeholder="+.google.com, +.facebook.com, +.youtube.com"
            />
          </Item>

          {/* Hosts 配置部分 */}
          <p className="mt-block text-body-lg font-bold">
            {t('settings.modals.dns.sections.hosts')}
          </p>

          <Item column>
            <ItemText
              primary={t('settings.modals.dns.fields.hosts.label')}
              secondary={t('settings.modals.dns.fields.hosts.description')}
            />
            <Textarea
              className={TEXTAREA_CLASS}
              spellCheck={false}
              value={values.hosts}
              onChange={handleChange('hosts')}
              placeholder="*.clash.dev=127.0.0.1, alpha.clash.dev=::1, test.com=1.1.1.1;2.2.2.2, baidu.com=google.com"
            />
          </Item>
        </div>
      ) : (
        <MonacoEditor
          height="100vh"
          language="yaml"
          value={yamlContent}
          theme={isDark ? 'vs-dark' : 'light'}
          className="flex-grow"
          onMount={(editorInstance) => {
            editorRef.current = editorInstance
          }}
          options={{
            tabSize: 2,
            minimap: {
              enabled: document.documentElement.clientWidth >= 1500,
            },
            mouseWheelZoom: true,
            quickSuggestions: {
              strings: true,
              comments: true,
              other: true,
            },
            padding: {
              top: 33,
            },
            fontFamily: `Fira Code, JetBrains Mono, Roboto Mono, "Source Code Pro", Consolas, Menlo, Monaco, monospace, "Courier New", "Apple Color Emoji"${
              getSystem() === 'windows' ? ', twemoji mozilla' : ''
            }`,
            fontLigatures: false,
            smoothScrolling: true,
          }}
          onChange={handleYamlChange}
        />
      )}
    </BaseDialog>
  )
}
