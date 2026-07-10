#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import process from 'node:process'

const HOST = '127.0.0.1'
const DEFAULT_REMOTE_PORT = 33331
const REMOTE_CHECK_TIMEOUT_MS = 1500
const SIGNAL_EXIT_CODES = { SIGINT: 130, SIGTERM: 143 }
const SAFE_DEV_IDENTIFIER =
  'io.github.clash-verge-rev.clash-verge-rev.safe-dev'

const parsePort = (name, value) => {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`)
  }
  return port
}

const bindPort = (port) =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen({ host: HOST, port, exclusive: true }, () => {
      const address = server.address()
      const selectedPort =
        address && typeof address === 'object' ? address.port : port
      server.close((error) => {
        if (error) reject(error)
        else resolve(selectedPort)
      })
    })
  })

const selectDevPort = async () => {
  if (process.env.VERGE_DEV_PORT) {
    const requestedPort = parsePort('VERGE_DEV_PORT', process.env.VERGE_DEV_PORT)
    try {
      return await bindPort(requestedPort)
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'EADDRINUSE') {
        throw new Error(`VERGE_DEV_PORT ${requestedPort} is already in use`)
      }
      throw error
    }
  }
  return bindPort(0)
}

const verifyRemoteApp = async (port) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REMOTE_CHECK_TIMEOUT_MS)
  try {
    const response = await fetch(`http://${HOST}:${port}/commands/cli`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'status' }),
      signal: controller.signal,
    })
    if (!response.ok) return false
    const payload = await response.json()
    return payload?.ok === true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

const killProcessGroup = (child, signal) => {
  if (!child.pid || child.exitCode !== null) return
  try {
    if (process.platform === 'win32') {
      // pnpm spawns the Tauri CLI, which in turn owns Vite and Rust. Kill the
      // whole tree so Ctrl-C cannot leave a background dev window/server.
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      })
    } else {
      process.kill(-child.pid, signal)
    }
  } catch (error) {
    if (!error || typeof error !== 'object' || error.code !== 'ESRCH') {
      console.warn(`[safe-dev] failed to forward ${signal}:`, error)
    }
  }
}

const runTauri = (devPort, remotePort) =>
  new Promise((resolve, reject) => {
    const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
    const devUrl = `http://${HOST}:${devPort}/`
    const temporaryConfig = JSON.stringify({
      identifier: SAFE_DEV_IDENTIFIER,
      build: { devUrl },
    })
    const args = [
      'exec',
      'tauri',
      'dev',
      '--features',
      'safe-dev',
      '--config',
      temporaryConfig,
    ]
    const env = {
      ...process.env,
      RUST_BACKTRACE: 'full',
      VERGE_DEV_PORT: String(devPort),
      VERGE_REMOTE_PORT: String(remotePort),
      VITE_VERGE_REMOTE_APP: '1',
      VITE_VERGE_REMOTE_PORT: String(remotePort),
      VITE_VERGE_REMOTE_READ_ONLY: '1',
      VITE_VERGE_SAFE_TAURI: '1',
    }

    const child = spawn(pnpm, args, {
      cwd: process.cwd(),
      detached: process.platform !== 'win32',
      env,
      stdio: 'inherit',
    })
    console.log(`[safe-dev] Tauri CLI PID: ${child.pid ?? 'unknown'}`)

    let forwardedSignal
    const forwardSignal = (signal) => {
      forwardedSignal ??= signal
      killProcessGroup(child, signal)
    }
    const onSigint = () => forwardSignal('SIGINT')
    const onSigterm = () => forwardSignal('SIGTERM')
    process.on('SIGINT', onSigint)
    process.on('SIGTERM', onSigterm)
    process.on('SIGHUP', onSigint)

    const cleanupListeners = () => {
      process.off('SIGINT', onSigint)
      process.off('SIGTERM', onSigterm)
      process.off('SIGHUP', onSigint)
    }

    child.once('error', (error) => {
      cleanupListeners()
      reject(error)
    })
    child.once('exit', (code, signal) => {
      cleanupListeners()
      if (signal) {
        resolve(SIGNAL_EXIT_CODES[signal] ?? 1)
      } else if (forwardedSignal) {
        resolve(SIGNAL_EXIT_CODES[forwardedSignal] ?? 1)
      } else {
        resolve(code ?? 1)
      }
    })
  })

const main = async () => {
  const remotePort = parsePort(
    'VERGE_REMOTE_PORT',
    process.env.VERGE_REMOTE_PORT || DEFAULT_REMOTE_PORT,
  )
  if (!(await verifyRemoteApp(remotePort))) {
    throw new Error(
      `Clash Verge App is not reachable at ${HOST}:${remotePort}; start the installed app first`,
    )
  }

  const devPort = await selectDevPort()
  const devUrl = `http://${HOST}:${devPort}/`
  console.log('[safe-dev] mode: read-only Tauri window')
  console.log(`[safe-dev] frontend: ${devUrl}`)
  console.log(`[safe-dev] read-only App bridge: http://${HOST}:${remotePort}`)
  console.log('[safe-dev] core/service/system network mutations: disabled')

  if (process.argv.includes('--dry-run')) {
    console.log('[safe-dev] dry run complete; no child process started')
    return 0
  }

  return runTauri(devPort, remotePort)
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    console.error(`[safe-dev] ${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
  })
