/**
 * 启动一个走 dev 实例代理的隔离 Chrome（pnpm dev:chrome [url]）。
 *
 * - 独立 user-data-dir（dev 配置目录下 dev-chrome-profile），不影响日常浏览器
 * - --proxy-server 指向 dev 实例的 mixed 端口（默认 7900，VERGE_DEV_MIXED_PORT 可覆盖）
 * - 访问任意域名后，在 dev 窗口 Connections 页或
 *   `VERGECTL_PORT=11233 vergectl connections list` 查看命中的规则与策略链
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const DEV_APP_ID = 'io.github.clash-verge-rev.clash-verge-rev.dev'

const dataRoot = () => {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support')
  }
  if (process.platform === 'win32') {
    return process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
  }
  return process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share')
}

const chromeBinary = () => {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN
  const candidates =
    process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : ['google-chrome', 'chromium']
  return candidates.find((bin) => !bin.startsWith('/') || fs.existsSync(bin))
}

const main = () => {
  const mixedPort = Number(process.env.VERGE_DEV_MIXED_PORT ?? 7900)
  const url = process.argv.slice(2).find((arg) => !arg.startsWith('-'))
  const binary = chromeBinary()

  if (!binary) {
    console.error(
      '[dev-chrome] 未找到 Chrome，可用 CHROME_BIN 环境变量指定浏览器二进制路径',
    )
    process.exit(1)
  }

  const userDataDir = path.join(dataRoot(), DEV_APP_ID, 'dev-chrome-profile')
  fs.mkdirSync(userDataDir, { recursive: true })

  const args = [
    `--user-data-dir=${userDataDir}`,
    `--proxy-server=http://127.0.0.1:${mixedPort}`,
    '--no-first-run',
    '--no-default-browser-check',
  ]
  if (url) args.push(url)

  console.log(`[dev-chrome] 代理：http://127.0.0.1:${mixedPort}`)
  console.log(`[dev-chrome] user-data-dir：${userDataDir}`)
  console.log(
    '[dev-chrome] 规则观测：dev 窗口 Connections 页，或 VERGECTL_PORT=11233 vergectl connections list',
  )

  const child = spawn(binary, args, { stdio: 'ignore', detached: true })
  child.unref()
}

main()
