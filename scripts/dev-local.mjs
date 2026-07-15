/**
 * 隔离的本地开发环境入口（pnpm dev）。
 *
 * 启动完整应用（verge-dev feature），与正式版彻底隔离：
 * - 配置目录：~/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev.dev
 * - IPC socket：/tmp/verge-dev/verge-mihomo.sock（Rust 侧 verge-dev 分支）
 * - 系统代理 / 系统 DNS：verge-dev 构建下全部 no-op，绝不触碰本机网络
 * - 端口：mixed 7900 / socks 7901 / http 7902（VERGE_DEV_MIXED_PORT 可覆盖起始端口）
 *
 * 首次运行（或传 --reset）时把正式版配置拷贝播种到 dev 目录，
 * 并强制关闭系统代理/TUN/自启动等开关、改写端口。
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import yaml from 'js-yaml'

const APP_ID = 'io.github.clash-verge-rev.clash-verge-rev'
const DEV_APP_ID = `${APP_ID}.dev`

const dataRoot = () => {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support')
  }
  if (process.platform === 'win32') {
    return process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
  }
  return process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share')
}

const RELEASE_DIR = path.join(dataRoot(), APP_ID)
const DEV_DIR = path.join(dataRoot(), DEV_APP_ID)

const MIXED_PORT = Number(process.env.VERGE_DEV_MIXED_PORT ?? 7900)
const SOCKS_PORT = MIXED_PORT + 1
const HTTP_PORT = MIXED_PORT + 2
const EXTERNAL_CONTROLLER = `127.0.0.1:${MIXED_PORT + 298}` // 7900 -> 8198

// 注意：clash-verge.yaml 是 enhance 生成的运行时输出文件，不拷贝也不 patch；
// clash 配置层（IClashTemp）的存储文件是 config.yaml。
const COPY_FILES = [
  'profiles.yaml',
  'verge.yaml',
  'config.yaml',
  'dns_config.yaml',
  'Country.mmdb',
  'geoip.dat',
  'geosite.dat',
]
const COPY_DIRS = ['profiles']

const log = (message) => console.log(`[dev-local] ${message}`)

const patchYamlFile = (filePath, patch) => {
  const doc = fs.existsSync(filePath)
    ? (yaml.load(fs.readFileSync(filePath, 'utf8')) ?? {})
    : {}
  Object.assign(doc, patch)
  fs.writeFileSync(filePath, yaml.dump(doc))
}

// 只改 tun.enable，保留 stack/auto-route 等其余子字段
const patchTunEnable = (filePath, enable) => {
  const doc = fs.existsSync(filePath)
    ? (yaml.load(fs.readFileSync(filePath, 'utf8')) ?? {})
    : {}
  doc.tun = { ...(doc.tun ?? {}), enable }
  fs.writeFileSync(filePath, yaml.dump(doc))
}

const seedDevDir = () => {
  if (!fs.existsSync(RELEASE_DIR)) {
    log(
      `正式版配置目录不存在（${RELEASE_DIR}），使用空目录启动，应用将生成默认配置`,
    )
    fs.mkdirSync(DEV_DIR, { recursive: true })
    return
  }

  fs.mkdirSync(DEV_DIR, { recursive: true })
  for (const file of COPY_FILES) {
    const src = path.join(RELEASE_DIR, file)
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(DEV_DIR, file))
    }
  }
  for (const dir of COPY_DIRS) {
    const src = path.join(RELEASE_DIR, dir)
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(DEV_DIR, dir), { recursive: true })
    }
  }

  // dev 环境强制安全开关 + 独立端口
  patchYamlFile(path.join(DEV_DIR, 'verge.yaml'), {
    enable_system_proxy: false,
    enable_tun_mode: false,
    enable_auto_launch: false,
    enable_proxy_guard: false,
    enable_external_controller: false,
    enable_silent_start: false,
    verge_mixed_port: MIXED_PORT,
    verge_socks_port: SOCKS_PORT,
    verge_port: HTTP_PORT,
  })
  const clashConfigPath = path.join(DEV_DIR, 'config.yaml')
  patchYamlFile(clashConfigPath, {
    'mixed-port': MIXED_PORT,
    'socks-port': SOCKS_PORT,
    port: HTTP_PORT,
    'external-controller': EXTERNAL_CONTROLLER,
    'allow-lan': false,
  })
  patchTunEnable(clashConfigPath, false)

  log(`已从正式版播种配置：${RELEASE_DIR} -> ${DEV_DIR}`)
  log(`端口：mixed ${MIXED_PORT} / socks ${SOCKS_PORT} / http ${HTTP_PORT}`)
}

const main = () => {
  const args = process.argv.slice(2)
  const reset = args.includes('--reset')
  const passthrough = args.filter((arg) => arg !== '--reset')

  if (reset && fs.existsSync(DEV_DIR)) {
    const backup = `${DEV_DIR}.bak-${Date.now()}`
    fs.renameSync(DEV_DIR, backup)
    log(`--reset：原 dev 配置已备份到 ${backup}`)
  }

  if (!fs.existsSync(DEV_DIR)) {
    seedDevDir()
  } else {
    log(
      `dev 配置目录已存在，跳过播种：${DEV_DIR}（如需重新播种运行 pnpm dev --reset）`,
    )
  }

  log('启动隔离开发实例（不会修改系统代理 / 系统 DNS）...')
  log(
    `观测：VERGECTL_PORT=11233 vergectl status / connections list；测试浏览器：pnpm dev:chrome`,
  )

  const result = spawnSync(
    'pnpm',
    ['exec', 'tauri', 'dev', '-f', 'verge-dev', ...passthrough],
    {
      stdio: 'inherit',
      env: { ...process.env, RUST_BACKTRACE: 'full' },
    },
  )
  process.exit(result.status ?? 0)
}

main()
