import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'

import legacy from '@vitejs/plugin-legacy'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import svgr from 'vite-plugin-svgr'

import {
  isReadOnlyCliPayload,
  safeDevReadOnlyError,
} from './src/dev/remote-read-only'

const remoteAppPort = process.env.VERGE_REMOTE_PORT || '33331'
const devServerPort = Number(process.env.VERGE_DEV_PORT || '3000')
const safeRemoteReadOnly =
  process.env.VITE_VERGE_SAFE_TAURI === '1' ||
  process.env.VITE_VERGE_REMOTE_READ_ONLY === '1'
const MAX_CLI_PAYLOAD_BYTES = 1024 * 1024

if (
  !Number.isInteger(devServerPort) ||
  devServerPort < 1 ||
  devServerPort > 65535
) {
  throw new Error(`Invalid VERGE_DEV_PORT: ${process.env.VERGE_DEV_PORT}`)
}

const sendJson = (
  response: ServerResponse,
  status: number,
  payload: Record<string, unknown>,
) => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}

const readJsonBody = async (request: IncomingMessage) => {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > MAX_CLI_PAYLOAD_BYTES) {
      throw new Error('CLI payload exceeds 1 MiB')
    }
    chunks.push(buffer)
  }

  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('CLI payload must be a JSON object')
  }
  return payload as Record<string, unknown>
}

const safeReadOnlyCliRelay: Plugin = {
  name: 'verge-safe-read-only-cli-relay',
  apply: 'serve',
  configureServer(server) {
    if (!safeRemoteReadOnly) return

    server.middlewares.use('/__verge/cli', (request, response) => {
      void (async () => {
        if (request.method !== 'POST') {
          sendJson(response, 405, {
            ok: false,
            error: '[Safe Dev] CLI relay only accepts POST',
          })
          return
        }

        let payload: Record<string, unknown>
        try {
          payload = await readJsonBody(request)
        } catch (error) {
          sendJson(response, 400, {
            ok: false,
            error: `[Safe Dev] invalid CLI payload: ${String(error)}`,
          })
          return
        }

        if (!isReadOnlyCliPayload(payload)) {
          const error = safeDevReadOnlyError(
            `CLI request: ${String(payload.cmd ?? 'unknown')}/${String(payload.action ?? '')}`,
          )
          sendJson(response, 403, { ok: false, error: error.message })
          return
        }

        const abortController = new AbortController()
        const timeout = setTimeout(() => abortController.abort(), 10_000)
        try {
          const upstream = await fetch(
            `http://127.0.0.1:${remoteAppPort}/commands/cli`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              signal: abortController.signal,
            },
          )
          response.statusCode = upstream.status
          response.setHeader(
            'Content-Type',
            upstream.headers.get('content-type') ||
              'application/json; charset=utf-8',
          )
          response.end(await upstream.text())
        } catch (error) {
          sendJson(response, 502, {
            ok: false,
            error: `[Safe Dev] production App CLI is unavailable: ${String(error)}`,
          })
        } finally {
          clearTimeout(timeout)
        }
      })()
    })
  },
}

export default defineConfig({
  root: 'src',
  server: {
    host: '127.0.0.1',
    port: devServerPort,
    strictPort: true,
    proxy: safeRemoteReadOnly
      ? {}
      : {
          '/__verge/cli': {
            target: `http://127.0.0.1:${remoteAppPort}`,
            changeOrigin: true,
            rewrite: () => '/commands/cli',
          },
        },
  },
  plugins: [
    safeReadOnlyCliRelay,
    svgr(),
    react(),
    legacy({
      modernTargets: ['edge>=109', 'safari>=14'],
      renderLegacyChunks: false,
      modernPolyfills: ['es.object.has-own', 'web.structured-clone'],
      additionalModernPolyfills: [
        path.resolve('./src/polyfills/matchMedia.js'),
        path.resolve('./src/polyfills/WeakRef.js'),
        path.resolve('./src/polyfills/RegExp.js'),
      ],
    }),
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
  resolve: {
    alias: {
      '@': path.resolve('./src'),
      '@root': path.resolve('.'),
    },
  },
  define: {
    OS_PLATFORM: `"${process.platform}"`,
  },
})
