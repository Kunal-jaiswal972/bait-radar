// Runs the Python transcript scraper via child_process and parses its JSON,
// distinguishing permanent "no transcript" from transient errors.

import { spawn } from "node:child_process";
import path from "node:path";
import { env } from "../config/env";
import type { TranscriptSegment } from "../types";

const DEFAULT_TIMEOUT_MS = 60_000;

export class TranscriptUnavailableError extends Error {} // permanent: disabled / none
export class TranscriptFetchError extends Error {} // transient: retry later

// Python sources aren't compiled into dist/, so resolve from cwd (project root).
function scriptPath(): string {
  const base = env().SCRIPTS_DIR ?? path.join(process.cwd(), "src", "scripts");
  return path.join(base, "fetch_transcript.py");
}

// Resolves transcript segments; rejects with TranscriptUnavailableError (no
// transcript) or TranscriptFetchError (transient -> failed_retryable).
export function fetchTranscript(
  videoId: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<TranscriptSegment[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(env().PYTHON_BIN, [scriptPath(), videoId], { windowsHide: true });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new TranscriptFetchError(`Transcript fetch timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    // Spawn failure (e.g. python not found) -> transient/config issue.
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new TranscriptFetchError(`Failed to spawn python: ${err.message}`));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code === 0) {
        try {
          resolve(JSON.parse(stdout) as TranscriptSegment[]);
        } catch {
          reject(new TranscriptFetchError(`Could not parse transcript JSON: ${stdout.slice(0, 200)}`));
        }
        return;
      }

      // exit 3 -> permanently unavailable; anything else -> retryable.
      const detail = stderr.trim() || `exit code ${code}`;
      reject(
        code === 3
          ? new TranscriptUnavailableError(detail)
          : new TranscriptFetchError(detail)
      );
    });
  });
}
