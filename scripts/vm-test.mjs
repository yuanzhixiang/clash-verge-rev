/**
 * 虚拟机端到端测试入口（pnpm test:vm）。
 *
 * 在 Tart macOS 虚拟机里安装正式构建的 Clash Verge，自动跑一遍会改动系统网络的功能
 * （系统代理、服务、TUN、系统 DNS、退出清理），测完销毁虚拟机，本机网络不受任何影响。
 *
 * 前置：tart、sshpass，以及由 macos-tahoe-vanilla 镜像克隆出的基础虚拟机（默认 verge-base）。
 * 参数：--skip-build 复用已有 .app；--keep 测完保留虚拟机便于排查。
 * 报告与虚拟机内日志写到 target/vm-test/<时间戳>/。
 */

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLE_DIR = path.join(ROOT, 'target', 'release', 'bundle', 'macos')
const APP_NAME = 'Clash Verge.app'

const BASE_VM = process.env.VERGE_VM_BASE ?? 'verge-base'
// vanilla 镜像公开的默认测试账号，只存在于本机虚拟网段里的临时虚拟机
const VM_USER = process.env.VERGE_VM_USER ?? 'admin'
const VM_PASSWORD = process.env.VERGE_VM_PASSWORD ?? 'admin'

const GUEST_APP = `/Applications/${APP_NAME}`
const GUEST_SHARE = '/Volumes/My Shared Files/bundle'
const VERGECTL = `"${GUEST_APP}/Contents/MacOS/vergectl"`
const GUEST_LOG_DIR =
  '~/Library/Application\\ Support/io.github.clash-verge-rev.clash-verge-rev/logs'
// 与 clash_verge_service_ipc::IPC_PATH 一致
const SERVICE_SOCKET = '/tmp/verge/clash-verge-service.sock'
// core/service.rs 判定服务版本不符、走重装流程时打的日志
const REINSTALL_LOG = '服务需要重装'
// 用一个公网 IP 判断流量走哪个网卡：TUN 开启时应是 utun，关闭后回到物理网卡
const PROBE_IP = '1.1.1.1'
const PROBE_URL = 'https://www.apple.com'

const args = new Set(process.argv.slice(2))
const SKIP_BUILD = args.has('--skip-build')
const KEEP_VM = args.has('--keep')

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
const VM_NAME = `verge-test-${stamp}`
const OUT_DIR = path.join(ROOT, 'target', 'vm-test', stamp)

const log = (message) => console.log(`[vm-test] ${message}`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 同步执行本机命令，失败时直接抛错 */
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

/** 在虚拟机里执行一条 shell 命令，返回 { ok, out } */
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

/** 轮询直到 check 返回真值或超时，返回最后一次的结果 */
const waitFor = async (check, timeoutMs, intervalMs = 2000) => {
  const deadline = Date.now() + timeoutMs
  let last = await check()
  while (!last && Date.now() < deadline) {
    await sleep(intervalMs)
    last = await check()
  }
  return last
}

/** 检查本机依赖与基础虚拟机是否就绪 */
const checkPrerequisites = () => {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('test:vm only supports Apple Silicon macOS hosts')
  }
  for (const bin of ['tart', 'sshpass']) {
    if (run('which', [bin], { allowFail: true }).status !== 0) {
      throw new Error(`missing dependency: ${bin}`)
    }
  }
  const vms = run('tart', ['list', '--format', 'json']).stdout
  if (!JSON.parse(vms).some((vm) => vm.Name === BASE_VM)) {
    throw new Error(
      `base VM "${BASE_VM}" not found; create it with: tart clone ghcr.io/cirruslabs/macos-tahoe-vanilla:26.6.2 ${BASE_VM}`,
    )
  }
}

/** 构建正式版 .app（不打 dmg），或在 --skip-build 时复用已有产物 */
const buildApp = () => {
  if (!SKIP_BUILD) {
    log('building release .app (this takes a while)...')
    run('pnpm', ['tauri', 'build', '--bundles', 'app'], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
    })
  }
  if (!fs.existsSync(path.join(BUNDLE_DIR, APP_NAME))) {
    throw new Error(`app bundle not found: ${path.join(BUNDLE_DIR, APP_NAME)}`)
  }
}

let vmProcess = null

/** 从基础虚拟机克隆一台临时机，无界面启动并挂载构建产物目录，等到 SSH 可用 */
const startVm = async () => {
  log(`cloning ${BASE_VM} -> ${VM_NAME}`)
  run('tart', ['clone', BASE_VM, VM_NAME])
  vmProcess = spawn(
    'tart',
    ['run', VM_NAME, '--no-graphics', `--dir=bundle:${BUNDLE_DIR}:ro`],
    { stdio: 'ignore' },
  )

  // tart ip --wait 会阻塞到虚拟机拿到 DHCP 地址
  vmIp = run('tart', ['ip', VM_NAME, '--wait', '180']).stdout.trim()
  log(`VM ip: ${vmIp}`)
  const ready = await waitFor(() => ssh('true').ok, 180_000, 3000)
  if (!ready) throw new Error('VM SSH did not come up in time')
}

/** 把 .app 装进 /Applications，并用和应用一致的命令装好系统服务 */
const installApp = async () => {
  const mounted = await waitFor(
    () => ssh(`test -d "${GUEST_SHARE}/${APP_NAME}"`).ok,
    60_000,
  )
  if (!mounted) throw new Error('shared bundle directory not mounted in VM')

  log('installing app into VM')
  const copy = ssh(
    `ditto "${GUEST_SHARE}/${APP_NAME}" "${GUEST_APP}" && xattr -cr "${GUEST_APP}"`,
  )
  if (!copy.ok) throw new Error(`install app failed: ${copy.out}`)

  // 应用自身走 osascript 管理员弹窗安装服务，SSH 下无法点弹窗，这里直接用 sudo 跑同一个安装器
  log('installing clash-verge-service')
  const service = ssh(
    `sudo CLASH_VERGE_SERVICE_GID=$(id -g) "${GUEST_APP}/Contents/Resources/resources/clash-verge-service-install"`,
  )
  if (!service.ok) throw new Error(`install service failed: ${service.out}`)

  // 服务没起来就启动应用，应用查不到服务版本会判定需要重装
  const ready = await waitFor(() => ssh(`test -S ${SERVICE_SOCKET}`).ok, 60_000)
  if (!ready) throw new Error(`service socket ${SERVICE_SOCKET} never appeared`)
}

/** 启动应用，等到 vergectl 能连上且内核真正跑起来 */
const launchApp = async () => {
  log('launching app')
  ssh(`open "${GUEST_APP}"`)
  const up = await waitFor(() => ssh(`${VERGECTL} status --json`).ok, 120_000)
  if (!up) throw new Error('app did not become reachable via vergectl')

  // 应用判定服务需要重装时会弹管理员密码框，无人值守下会一直卡住，直接中止并说明原因
  const running = await waitFor(() => {
    const mode = vergectlJson('status --json')?.running_mode
    if (mode && mode !== 'NotRunning') return mode
    return ssh(`grep -q '${REINSTALL_LOG}' ${GUEST_LOG_DIR}/latest.log`).ok
      ? 'reinstall'
      : null
  }, 60_000)
  if (running === 'reinstall') {
    throw new Error(
      'app decided the service needs reinstalling (version mismatch between bundled service binary and clash_verge_service_ipc crate?) and is waiting on an admin password prompt',
    )
  }
  if (!running) throw new Error('core did not start (running_mode NotRunning)')
  log(`core running mode: ${running}`)
}

/** 读取虚拟机当前的网络状态快照：代理、DNS、探测 IP 走的网卡 */
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

const vergectlJson = (command) => {
  const result = ssh(`${VERGECTL} ${command}`)
  if (!result.ok) return null
  try {
    return JSON.parse(result.out)
  } catch {
    return null
  }
}

const patchVerge = (patch) =>
  ssh(`${VERGECTL} config patch verge --json '${JSON.stringify(patch)}'`)

const curlStatus = (extra = '') =>
  ssh(`curl -s -o /dev/null -m 15 -w '%{http_code}' ${extra} ${PROBE_URL}`).out

const results = []

/** 跑一个测试用例：记录通过与否和细节，单个用例出错不影响后续用例 */
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

/** 依次验证系统代理、服务、TUN、系统 DNS 和退出清理 */
const runTests = async () => {
  const baseline = networkSnapshot()
  const verge = vergectlJson('config get verge') ?? {}
  const mixedPort = verge.verge_mixed_port ?? 7897

  await testCase('app reachable via vergectl', async () => {
    const status = vergectlJson('status --json')
    assert(status, 'vergectl status returned no JSON')
    return status
  })

  await testCase('service available', async () => {
    const status = vergectlJson('service status')
    assert(status?.available === true, JSON.stringify(status))
    return status
  })

  await testCase('enable system proxy', async () => {
    const patch = patchVerge({ enable_system_proxy: true })
    assert(patch.ok, patch.out)
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
    const patch = patchVerge({ enable_system_proxy: false })
    assert(patch.ok, patch.out)
    const snap = await waitFor(() => {
      const s = networkSnapshot()
      return !s.httpEnabled && !s.httpsEnabled ? s : null
    }, 20_000)
    assert(snap, 'system proxy still enabled')
    return snap
  })

  await testCase('enable TUN', async () => {
    const patch = patchVerge({ enable_tun_mode: true })
    assert(patch.ok, patch.out)
    const snap = await waitFor(() => {
      const s = networkSnapshot()
      return s.probeInterface?.startsWith('utun') ? s : null
    }, 30_000)
    assert(snap, `traffic to ${PROBE_IP} not routed via utun`)
    const code = curlStatus()
    assert(code === '200', `request via TUN returned ${code}`)
    return snap
  })

  await testCase('TUN sets system DNS to 114.114.114.114', async () => {
    const snap = await waitFor(() => {
      const s = networkSnapshot()
      return s.dns.includes('114.114.114.114') ? s : null
    }, 15_000)
    assert(snap, `system DNS is "${networkSnapshot().dns}"`)
    return snap
  })

  await testCase('disable TUN restores route and DNS', async () => {
    const patch = patchVerge({ enable_tun_mode: false })
    assert(patch.ok, patch.out)
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

  await testCase('exit with system proxy on leaves network clean', async () => {
    const patch = patchVerge({ enable_system_proxy: true })
    assert(patch.ok, patch.out)
    await waitFor(() => networkSnapshot().httpEnabled, 20_000)
    ssh(`${VERGECTL} app exit`)
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

  return { baseline, mixedPort }
}

/** 把虚拟机里的应用日志拷回本机报告目录 */
const collectLogs = () => {
  const target = path.join(OUT_DIR, 'guest-logs')
  fs.mkdirSync(target, { recursive: true })
  spawnSync(
    'sshpass',
    [
      '-p',
      VM_PASSWORD,
      'scp',
      ...sshOptions,
      '-r',
      `${VM_USER}@${vmIp}:${GUEST_LOG_DIR}/.`,
      target,
    ],
    { encoding: 'utf8' },
  )
}

/** 停止并删除临时虚拟机；--keep 时保留 */
const destroyVm = () => {
  if (KEEP_VM) {
    log(
      `keeping VM ${VM_NAME} (ip ${vmIp}); delete with: tart delete ${VM_NAME}`,
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
  let context = {}
  let fatal = null

  // Ctrl-C 时也要销毁虚拟机，不留残留
  process.on('SIGINT', () => {
    if (created) destroyVm()
    process.exit(130)
  })

  try {
    checkPrerequisites()
    buildApp()
    created = true
    await startVm()
    await installApp()
    await launchApp()
    context = await runTests()
  } catch (error) {
    fatal = String(error.message ?? error)
    log(`ERROR ${fatal}`)
  } finally {
    if (created && vmIp) collectLogs()
    if (created) destroyVm()
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const report = { vm: VM_NAME, base: BASE_VM, fatal, ...context, results }
  fs.writeFileSync(
    path.join(OUT_DIR, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )

  const failed = results.filter((r) => !r.ok).length
  log(
    `${results.length - failed}/${results.length} passed${fatal ? ', aborted early' : ''}; report: ${path.relative(ROOT, OUT_DIR)}/report.json`,
  )
  process.exit(fatal || failed ? 1 : 0)
}

main()
