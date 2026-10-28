import { useCallback, useEffect, useState } from 'react'

// Served by the fork plugin in src-tauri/src/fork; the webview origin authenticates the call.
const API = 'http://127.0.0.1:33380/api'

export async function call<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
) {
  const response = await fetch(`${API}/${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload?.error ?? response.statusText)
  return payload as T
}

/** True when the bridge is running and its subscription is the active profile. */
export function useSurgeActive() {
  const [active, setActive] = useState(false)

  const load = useCallback(async () => {
    try {
      const [surge, profiles] = await Promise.all([
        call<{ enabled: boolean; subscription_url: string }>('GET', 'surge'),
        call<{ url: string | null; current: boolean }[]>('GET', 'profiles'),
      ])
      setActive(
        surge.enabled &&
          profiles.some(
            (row) => row.current && row.url === surge.subscription_url,
          ),
      )
    } catch {
      setActive(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return active
}
