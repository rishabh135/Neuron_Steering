import { ApiError, type ApiStatus, type LabApi, type SavedRunRow } from "@lab/store"
import type { Snapshot } from "@lab/types"

// Relative URLs only: Vite proxies /api in development and serve.py answers it in production.
async function json<T>(res: Response): Promise<T> {
  let body: unknown = null
  try { body = await res.json() } catch { /* non-JSON error page */ }
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string } | null)?.error ?? `${res.status} ${res.statusText}`)
  return body as T
}

export const api: LabApi = {
  status: (signal) => fetch("/api/status", { signal, cache: "no-store" }).then((r) => json<ApiStatus>(r)),
  compare: (s: Snapshot, signal) =>
    fetch("/api/compare", { method: "POST", headers: { "Content-Type": "application/json" }, signal,
      body: JSON.stringify({ prompt: s.prompt, preset: s.preset, intensity: s.intensity, max_new: s.maxNew, ...(s.component === null ? {} : { component: s.component }) }) }).then((r) => json<unknown>(r)),
  runs: () => fetch("/api/runs", { cache: "no-store" }).then((r) => json<SavedRunRow[]>(r)),
  run: (id) => fetch(`/api/runs/${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => json<unknown>(r)),
}
