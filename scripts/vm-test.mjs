/**
 * Fork-only end-to-end test in a disposable Tart macOS VM (node scripts/vm-test.mjs).
 *
 * Installs a release build plus vergectl into a fresh clone of the base VM and checks the
 * features that touch system networking (system proxy, service, TUN, DNS, exit cleanup)
 * and the Surge bridge, then destroys the VM. The host network is never touched.
 *
 * Flags: --skip-build reuse existing artifacts; --keep leave the VM running;
 *        --show open the VM window. Reports land in target/vm-test/<timestamp>/.
 * See spec/scripts/vm-test.md.
 */

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLE_DIR = path.join(ROOT, 'target', 'release', 'bundle', 'macos')
const CLI_DIR = path.join(ROOT, 'crates', 'vergectl', 'target', 'release')
const APP_NAME = 'Clash Verge.app'

const BASE_VM = process.env.VERGE_VM_BASE ?? 'verge-base'
// Published default credentials of the vanilla image; the VM is only reachable on the host NAT.
const VM_USER = process.env.VERGE_VM_USER ?? 'admin'
const VM_PASSWORD = process.env.VERGE_VM_PASSWORD ?? 'admin'

const SURGE_REL = 'Library/Mobile Documents/iCloud~com~nssurge~inc/Documents'
const HOST_SURGE = path.join(os.homedir(), SURGE_REL, 'Default.conf')
const GUEST_SURGE_DIR = `/Users/${VM_USER}/${SURGE_REL}`

const GUEST_APP = `/Applications/${APP_NAME}`
const GUEST_SHARE = '/Volumes/My Shared Files'
const VERGECTL = '/usr/local/bin/vergectl'
const GUEST_DATA = `~/Library/Application\\ Support/io.github.clash-verge-rev.clash-verge-rev`
const PROBE_IP = '1.1.1.1'
const PROBE_URL = 'https://www.apple.com'

const args = new Set(process.argv.slice(2))
const SKIP_BUILD = args.has('--skip-build')
const KEEP_VM = args.has('--keep')
const SHOW_VM = args.has('--show')

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
const VM_NAME = `verge-test-${stamp}`
const OUT_DIR = path.join(ROOT, 'target', 'vm-test', stamp)

const log = (message) => console.log(`[vm-test] ${message}`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const run = (cmd, cmdArgs, options = {}) => {
  const result = spawnSync(cmd, cmdArgs, { encoding: 'utf8', ...options })
  if (result.status !== 0 && !options.allowFail) {
    throw new Error(
      `${cmd} ${cmdArgs.join(' ')} failed: ${result.stderr || result.stdout}`,
    )
  }
  return result
}

const sshOptions = [
  '-o',
  'StrictHostKeyChecking=no',
  '-o',
  'UserKnownHostsFile=/dev/null',
  '-o',
  'LogLevel=ERROR',
  '-o',
  'ConnectTimeout=5',
]

let vmIp = null

const ssh = (command) => {
  const result = spawnSync(
    'sshpass',
    ['-p', VM_PASSWORD, 'ssh', ...sshOptions, `${VM_USER}@${vmIp}`, command],
    { encoding: 'utf8' },
  )
  return {
    ok: result.status === 0,
    out: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  }
}

/** Writes a host file to a guest path; scp mangles paths with spaces such as iCloud's. */
const pushFile = (from, to) => {
  const result = spawnSync(
    'sshpass',
    [
      '-p',
      VM_PASSWORD,
      'ssh',
      ...sshOptions,
      `${VM_USER}@${vmIp}`,
      `mkdir -p "$(dirname "${to}")" && cat > "${to}"`,
    ],
    { input: fs.readFileSync(from) },
  )
  if (result.status !== 0) throw new Error(`copy ${from} failed`)
}

const scp = (from, to) =>
  run('sshpass', ['-p', VM_PASSWORD, 'scp', ...sshOptions, '-r', from, to], {
    allowFail: true,
  })

const waitFor = async (check, timeoutMs, intervalMs = 2000) => {
  const deadline = Date.now() + timeoutMs
  let last = await check()
  while (!last && Date.now() < deadline) {
    await sleep(intervalMs)
    last = await check()
  }
  return last
}

const checkPrerequisites = () => {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('vm-test only supports Apple Silicon macOS hosts')
  }
  for (const bin of ['tart', 'sshpass']) {
    if (run('which', [bin], { allowFail: true }).status !== 0) {
      throw new Error(`missing dependency: ${bin}`)
    }
  }
  const vms = JSON.parse(run('tart', ['list', '--format', 'json']).stdout)
  if (!vms.some((vm) => vm.Name === BASE_VM)) {
    throw new Error(
      `base VM "${BASE_VM}" not found; create it with: tart clone ghcr.io/cirruslabs/macos-tahoe-vanilla:26.6.2 ${BASE_VM}`,
    )
  }
}

/** Release .app without updater artifacts (they need the upstream signing key) plus vergectl. */
const build = () => {
  if (!SKIP_BUILD) {
    log('building release .app (this takes a while)...')
    run(
      'pnpm',
      [
        'tauri',
        'build',
        '--bundles',
        'app',
        '--config',
        '{"bundle":{"createUpdaterArtifacts":false}}',
      ],
      {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
      },
    )
    log('building vergectl...')
    run(
      'cargo',
      [
        'build',
        '--release',
        '--manifest-path',
        path.join(ROOT, 'crates', 'vergectl', 'Cargo.toml'),
      ],
      { stdio: 'inherit' },
    )
  }
  for (const artifact of [
    path.join(BUNDLE_DIR, APP_NAME),
    path.join(CLI_DIR, 'vergectl'),
  ]) {
    if (!fs.existsSync(artifact))
      throw new Error(`artifact not found: ${artifact}`)
  }
}

let vmProcess = null

const startVm = async () => {
  log(`cloning ${BASE_VM} -> ${VM_NAME}`)
  run('tart', ['clone', BASE_VM, VM_NAME])
  const runArgs = [
    'run',
    VM_NAME,
    `--dir=bundle:${BUNDLE_DIR}:ro`,
    `--dir=cli:${CLI_DIR}:ro`,
  ]
  if (!SHOW_VM) runArgs.push('--no-graphics')
  vmProcess = spawn('tart', runArgs, { stdio: 'ignore', detached: KEEP_VM })
  if (KEEP_VM) vmProcess.unref()

  vmIp = run('tart', ['ip', VM_NAME, '--wait', '180']).stdout.trim()
  log(`VM ip: ${vmIp}`)
  if (!(await waitFor(() => ssh('true').ok, 180_000, 3000))) {
    throw new Error('VM SSH did not come up in time')
  }
}

const install = async () => {
  const mounted = await waitFor(
    () =>
      ssh(
        `test -d "${GUEST_SHARE}/bundle/${APP_NAME}" && test -f "${GUEST_SHARE}/cli/vergectl"`,
      ).ok,
    60_000,
  )
  if (!mounted) throw new Error('shared directories not mounted in VM')

  log('installing app and vergectl into VM')
  const copy = ssh(
    `ditto "${GUEST_SHARE}/bundle/${APP_NAME}" "${GUEST_APP}" && xattr -cr "${GUEST_APP}" && sudo mkdir -p /usr/local/bin && sudo install -m 755 "${GUEST_SHARE}/cli/vergectl" ${VERGECTL}`,
  )
  if (!copy.ok) throw new Error(`install failed: ${copy.out}`)

  // Same installer invocation as the app; running it as root skips the osascript prompt.
  log('installing clash-verge-service')
  const macos = `${GUEST_APP}/Contents/MacOS`
  const service = ssh(
    `sudo "${GUEST_APP}/Contents/Resources/resources/clash-verge-service-install" --prepare-install --gid $(id -g) --prompt vm-test --core verge-mihomo "${macos}/verge-mihomo" --core verge-mihomo-alpha "${macos}/verge-mihomo-alpha"`,
  )
  if (!service.ok) throw new Error(`install service failed: ${service.out}`)

  if (fs.existsSync(HOST_SURGE)) {
    log('copying Surge Default.conf into VM')
    pushFile(HOST_SURGE, `${GUEST_SURGE_DIR}/Default.conf`)
  }
}

const vergectl = (command) => {
  const result = ssh(`${VERGECTL} ${command}`)
  if (!result.ok) return { ok: false, out: result.out, json: null }
  try {
    return { ok: true, out: result.out, json: JSON.parse(result.out) }
  } catch {
    return { ok: true, out: result.out, json: null }
  }
}

const launchApp = async () => {
  log('launching app')
  ssh(`open "${GUEST_APP}"`)
  const mode = await waitFor(() => {
    const status = vergectl('status').json
    return status && status.running_mode !== 'NotRunning'
      ? status.running_mode
      : null
  }, 120_000)
  if (!mode) {
    throw new Error(
      `core did not start: ${vergectl('status').out || 'vergectl unreachable'}`,
    )
  }
  log(`core running mode: ${mode}`)
}

const networkSnapshot = () => {
  const proxy = ssh('scutil --proxy').out
  return {
    httpEnabled: /HTTPEnable : 1/.test(proxy),
    httpPort: Number(proxy.match(/HTTPPort : (\d+)/)?.[1] ?? 0),
    httpsEnabled: /HTTPSEnable : 1/.test(proxy),
    dns: ssh('networksetup -getdnsservers Ethernet').out,
    probeInterface:
      ssh(`route -n get ${PROBE_IP} | awk '/interface:/{print $2}'`).out ||
      null,
  }
}

const curlStatus = (extra = '') =>
  ssh(`curl -s -o /dev/null -m 20 -w '%{http_code}' ${extra} ${PROBE_URL}`).out

const results = []

const testCase = async (name, fn) => {
  try {
    const detail = await fn()
    results.push({ name, ok: true, detail })
    log(`PASS ${name}`)
  } catch (error) {
    results.push({ name, ok: false, detail: String(error.message ?? error) })
    log(`FAIL ${name}: ${error.message ?? error}`)
  }
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const systemTests = async (baseline) => {
  const mixedPort = vergectl('status').json?.mixed_port ?? 7897

  await testCase('service available', async () => {
    const service = vergectl('service').json
    assert(service?.available === true, JSON.stringify(service?.state))
    return service.state
  })

  await testCase('enable system proxy', async () => {
    assert(vergectl('sysproxy on').ok, 'vergectl sysproxy on failed')
    const snap = await waitFor(() => {
      const s = networkSnapshot()
      return s.httpEnabled && s.httpPort === mixedPort ? s : null
    }, 20_000)
    assert(snap, `system proxy not set to ${mixedPort}`)
    const code = curlStatus(`-x http://127.0.0.1:${mixedPort}`)
    assert(code === '200', `request through proxy returned ${code}`)
    return snap
  })

  await testCase('disable system proxy', async () => {
    assert(vergectl('sysproxy off').ok, 'vergectl sysproxy off failed')
    const snap = await waitFor(() => {
      const s = networkSnapshot()
      return !s.httpEnabled && !s.httpsEnabled ? s : null
    }, 20_000)
    assert(snap, 'system proxy still enabled')
    return snap
  })

  await testCase('enable TUN', async () => {
    assert(vergectl('tun on').ok, 'vergectl tun on failed')
    const snap = await waitFor(() => {
      const s = networkSnapshot()
      return s.probeInterface?.startsWith('utun') ? s : null
    }, 30_000)
    assert(snap, `traffic to ${PROBE_IP} not routed via utun`)
    const code = curlStatus()
    assert(code === '200', `request via TUN returned ${code}`)
    return snap
  })

  await testCase('disable TUN restores route and DNS', async () => {
    assert(vergectl('tun off').ok, 'vergectl tun off failed')
    const snap = await waitFor(() => {
      const s = networkSnapshot()
      return s.probeInterface === baseline.probeInterface &&
        s.dns === baseline.dns
        ? s
        : null
    }, 30_000)
    const now = networkSnapshot()
    assert(
      snap,
      `route=${now.probeInterface} (want ${baseline.probeInterface}), dns="${now.dns}" (want "${baseline.dns}")`,
    )
    return snap
  })

  return mixedPort
}

const surgeTests = async (mixedPort) => {
  if (!fs.existsSync(HOST_SURGE)) {
    log(`skip Surge tests: ${HOST_SURGE} not found on host`)
    return
  }
  let surge = null

  await testCase('surge profile converted', async () => {
    surge = await waitFor(() => {
      const state = vergectl('surge').json
      return state?.status?.converted_at ? state : null
    }, 20_000)
    assert(surge, `not converted: ${vergectl('surge').out}`)
    const { stats, error } = surge.status
    assert(!error, error)
    assert(
      stats.proxies > 0 && stats.groups > 0 && stats.rules > 0,
      JSON.stringify(stats),
    )
    return { stats, warnings: surge.status.warnings }
  })

  await testCase('surge import activates subscription', async () => {
    const imported = vergectl('surge import')
    assert(imported.ok, imported.out)
    const current = vergectl('profiles').json?.find((p) => p.current)
    assert(
      current?.url === surge?.subscription_url,
      `current profile is ${current?.url}`,
    )
    return current
  })

  await testCase('surge groups loaded with members', async () => {
    const groups = await waitFor(() => {
      const list = vergectl('groups').json
      const named = list?.filter((g) => g.type === 'Selector') ?? []
      return named.length >= surge.status.stats.groups &&
        named.every((g) => g.members > 0)
        ? named
        : null
    }, 60_000)
    assert(groups, `groups: ${vergectl('groups').out.slice(0, 600)}`)
    return groups
  })

  await testCase('traffic flows through Surge rules', async () => {
    const code = curlStatus(`-x http://127.0.0.1:${mixedPort}`)
    assert(['200', '301', '302'].includes(code), `got ${code}`)
    return code
  })

  await testCase(
    'editing Default.conf refreshes the subscription',
    async () => {
      const before = vergectl('surge').json?.status?.converted_at ?? 0
      ssh(
        `printf '\\n# vm-test ${stamp}\\n' >> "${GUEST_SURGE_DIR}/Default.conf"`,
      )
      const after = await waitFor(() => {
        const at = vergectl('surge').json?.status?.converted_at ?? 0
        return at > before ? at : null
      }, 20_000)
      assert(after, 'conversion did not rerun after the file changed')
      const refreshed = await waitFor(
        () =>
          ssh(
            `grep -rh "refreshed 1 subscription" ${GUEST_DATA}/logs 2>/dev/null | tail -1`,
          ).out || null,
        30_000,
      )
      assert(refreshed, 'subscription refresh not logged')
      return { before, after }
    },
  )
}

const exitTest = async (baseline) => {
  await testCase('exit with system proxy on leaves network clean', async () => {
    assert(vergectl('sysproxy on').ok, 'vergectl sysproxy on failed')
    await waitFor(() => networkSnapshot().httpEnabled, 20_000)
    vergectl('app exit')
    const gone = await waitFor(() => !ssh('pgrep -x clash-verge').ok, 30_000)
    assert(gone, 'app process still running after exit')
    const snap = networkSnapshot()
    assert(!snap.httpEnabled, 'system proxy left enabled after exit')
    assert(snap.dns === baseline.dns, `DNS left as "${snap.dns}"`)
    assert(
      snap.probeInterface === baseline.probeInterface,
      `route left on ${snap.probeInterface}`,
    )
    return snap
  })
}

const collectLogs = () => {
  const target = path.join(OUT_DIR, 'guest-logs')
  fs.mkdirSync(target, { recursive: true })
  scp(`${VM_USER}@${vmIp}:${GUEST_DATA}/logs/.`, target)
}

const destroyVm = () => {
  if (KEEP_VM) {
    log(
      `keeping VM ${VM_NAME} (ip ${vmIp}); delete with: tart stop ${VM_NAME} && tart delete ${VM_NAME}`,
    )
    return
  }
  run('tart', ['stop', VM_NAME], { allowFail: true })
  vmProcess?.kill()
  run('tart', ['delete', VM_NAME], { allowFail: true })
  log(`VM ${VM_NAME} destroyed`)
}

const main = async () => {
  let created = false
  let fatal = null

  process.on('SIGINT', () => {
    if (created) destroyVm()
    process.exit(130)
  })

  try {
    checkPrerequisites()
    build()
    created = true
    await startVm()
    await install()
    await launchApp()
    const baseline = networkSnapshot()
    const mixedPort = await systemTests(baseline)
    await surgeTests(mixedPort)
    await exitTest(baseline)
    if (KEEP_VM) {
      // Leave the app running for a manual look after the exit test closed it.
      ssh(`open "${GUEST_APP}"`)
    }
  } catch (error) {
    fatal = String(error.message ?? error)
    log(`ERROR ${fatal}`)
  } finally {
    if (created && vmIp) collectLogs()
    if (created) destroyVm()
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(
    path.join(OUT_DIR, 'report.json'),
    `${JSON.stringify({ vm: VM_NAME, base: BASE_VM, fatal, results }, null, 2)}\n`,
  )
  const failed = results.filter((r) => !r.ok).length
  log(
    `${results.length - failed}/${results.length} passed${fatal ? ', aborted early' : ''}; report: ${path.relative(ROOT, OUT_DIR)}/report.json`,
  )
  process.exit(fatal || failed ? 1 : 0)
}

main()
