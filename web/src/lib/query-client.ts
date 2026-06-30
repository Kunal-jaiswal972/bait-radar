import { QueryClient } from "@tanstack/react-query"

const STALE_TIME_MS = 60_000

// Single shared client. Server state lives here — never mirrored into local
// React state (see AGENTS.md §4).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME_MS,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
