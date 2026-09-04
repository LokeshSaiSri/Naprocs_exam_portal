// Multi-language code execution via a self-hosted Piston instance
// (https://github.com/engineer-man/piston). Researched and verified live:
// the public Piston API went whitelist-only as of 2026-02-15, so
// PISTON_API_URL must point at a self-hosted instance (Docker: `docker run
// -d --privileged -p 2000:2000 -v piston_data:/piston
// ghcr.io/engineer-man/piston`, then install each language package via
// `POST /api/v2/packages`). Requires a Docker-capable host in production
// (Railway/Render/self-host; NOT serverless-only platforms like Netlify).

const PISTON_API_URL = process.env.PISTON_API_URL || "http://localhost:2000";

// Maps our app's language identifiers to Piston's language name, the pinned
// version actually installed, and the filename Piston needs (Java requires
// the public class name to match the filename exactly).
const LANGUAGE_CONFIG: Record<string, { language: string; version: string; filename: string }> = {
  python: { language: "python", version: "3.10.0", filename: "main.py" },
  java: { language: "java", version: "15.0.2", filename: "Main.java" },
  c: { language: "c", version: "10.2.0", filename: "main.c" },
  cpp: { language: "c++", version: "10.2.0", filename: "main.cpp" },
};

export function isPistonLanguage(language: string | undefined | null): language is keyof typeof LANGUAGE_CONFIG {
  return !!language && language in LANGUAGE_CONFIG;
}

export interface PistonResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function executeOnce(language: string, code: string, stdin: string, timeoutMs: number): Promise<PistonResult> {
  const config = LANGUAGE_CONFIG[language];
  if (!config) throw new Error(`Unsupported Piston language: ${language}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.PISTON_API_KEY) {
      headers["Authorization"] = `Bearer ${process.env.PISTON_API_KEY}`;
    }

    const res = await fetch(`${PISTON_API_URL}/api/v2/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        language: config.language,
        version: config.version,
        files: [{ name: config.filename, content: code }],
        stdin,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({} as any));
      throw new Error(errBody.message || `Execution service returned status ${res.status}`);
    }

    const data = await res.json();

    // Some Piston versions report a separate `compile` step for compiled
    // languages; if it failed, surface that instead of a (nonexistent) run.
    if (data.compile && data.compile.code !== 0) {
      return { stdout: "", stderr: data.compile.stderr || data.compile.output || "Compilation failed", exitCode: data.compile.code };
    }

    return {
      stdout: data.run?.stdout || "",
      stderr: data.run?.stderr || "",
      exitCode: data.run?.code ?? 1,
    };
  } catch (e: any) {
    if (e.name === "AbortError") {
      return { stdout: "", stderr: "Execution timed out.", exitCode: 124 };
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Found via a real candidate's submission + reproduction: this self-hosted
// Piston setup occasionally returns a clean exit (code 0, no stderr) with
// completely empty stdout, on a program that should always print something --
// a byte-identical retry of the exact same request then succeeds normally.
// 12/12 isolated direct calls (sequential and concurrent) never reproduced it,
// but real usage did -- consistent with transient infra flakiness (container
// job-cleanup timing under Docker Desktop's virtualization), not a code bug.
// A retry costs nothing for genuinely-broken candidate code (it'll just fail
// again, identically) but protects a genuinely-correct answer from being
// marked wrong by infrastructure noise -- same reasoning as the Supabase
// Storage 429 retry (SUPABASE_MIGRATION.md).
function looksSuspiciouslyEmpty(result: PistonResult): boolean {
  return result.exitCode === 0 && result.stdout.trim() === "" && result.stderr.trim() === "";
}

// Full-program, stdin -> stdout execution (the code receives `stdin` as
// standard input and must print its answer to standard output) -- the
// standard convention for multi-language judges, and the only one that's
// portable across Python/Java/C/C++ without per-language question authoring.
export async function executeViaPiston(language: string, code: string, stdin: string, timeoutMs = 8000): Promise<PistonResult> {
  let lastResult: PistonResult | null = null;
  for (let attempt = 0; attempt <= 2; attempt++) {
    const result = await executeOnce(language, code, stdin, timeoutMs);
    if (!looksSuspiciouslyEmpty(result)) return result;
    lastResult = result;
    await new Promise((resolve) => setTimeout(resolve, 150 + Math.random() * 150));
  }
  return lastResult!;
}
