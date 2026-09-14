/**
 * Harper grammar engine — lazy, on-device, offline.
 *
 * Harper (automattic/harper) is a grammar checker written in Rust and compiled
 * to WebAssembly. `harper.js` wraps it for the browser; the WebAssembly binary
 * ships with the app, so nothing ever leaves the device.
 *
 * - `WorkerLinter` runs the analysis (and Harper's expensive dictionary setup)
 *   on a dedicated worker, so typing stays smooth. WebViews without module
 *   worker support fall back to `LocalLinter` on the main thread.
 * - The engine is created on first use and reused for the lifetime of the
 *   page; everything below is guarded so callers can treat a failure as
 *   "grammar checking is unavailable" instead of crashing the editor.
 *
 * This module is the only place that touches Harper. The other files in this
 * folder are plain DOM helpers so they can be unit-tested without WebAssembly.
 */
import type { BinaryModule, Lint, LintOptions, Linter } from 'harper.js'

/** Ignored lints are persisted as Harper's privacy-preserving context hashes. */
export const GRAMMAR_IGNORED_STORAGE_KEY = 'notesdesktop:grammar-ignored-lints'

/** Words the user added to the dictionary (names, jargon, …). */
export const GRAMMAR_DICTIONARY_STORAGE_KEY = 'notesdesktop:grammar-dictionary'

/** How long the worker gets to compile the WebAssembly before we fall back. */
const WORKER_SETUP_TIMEOUT_MS = 8_000

let linterPromise: Promise<Linter> | null = null
let linterUnavailable = false

async function createLinter(): Promise<Linter> {
  const { WorkerLinter, LocalLinter } = await import('harper.js')
  const binary = await loadBinaryModule()

  try {
    const linter = new WorkerLinter({ binary })
    await withTimeout(linter.setup(), WORKER_SETUP_TIMEOUT_MS)
    console.info('[grammar] Worker linter ready')
    return linter
  } catch (error) {
    // Some WebViews reject blob/module workers or refuse custom-scheme fetches
    // from a worker — run the checker on the main thread instead.
    console.warn('[grammar] Worker linter unavailable, using the main thread:', error)
  }

  const linter = new LocalLinter({ binary })
  await linter.setup()
  console.info('[grammar] Main-thread linter ready')
  return linter
}

/**
 * Hand Harper a `blob:` URL holding the WebAssembly bytes.
 *
 * The stock entry point points at the bundler's asset path, which Harper then
 * fetches **twice** — once per context (its worker and the page, the latter to
 * deserialise lint results) — and a 16 MB response streaming into the HTTP
 * cache is exactly the kind of request that can fail or be aborted mid-body.
 * Downloading once and staging the bytes in a blob removes both problems (and
 * works the same in every WebView, including custom `tauri://` schemes).
 */
async function loadBinaryModule(): Promise<BinaryModule> {
  const { createBinaryModuleFromUrl } = await import('harper.js')
  const { slimBinary } = await import('harper.js/slimBinary')

  try {
    const assetUrl = new URL(String(slimBinary.url), document.baseURI).href
    const response = await fetch(assetUrl)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const bytes = await response.arrayBuffer()
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/wasm' }))
    console.info('[grammar] WebAssembly staged as a blob URL')
    return createBinaryModuleFromUrl(blobUrl, 'slim')
  } catch (error) {
    console.warn('[grammar] Could not stage the WebAssembly, using the asset URL:', error)
    return slimBinary
  }
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Grammar worker setup timed out')), milliseconds)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

async function restoreIgnoredLints(linter: Linter): Promise<void> {
  if (typeof localStorage === 'undefined') return
  try {
    const stored = localStorage.getItem(GRAMMAR_IGNORED_STORAGE_KEY)
    if (stored) await linter.importIgnoredLints(stored)
  } catch (error) {
    console.warn('[grammar] Could not restore ignored lints:', error)
  }
}

const persistIgnoredLints = async (linter: Linter): Promise<void> => {
  if (typeof localStorage === 'undefined') return
  try {
    const json = await linter.exportIgnoredLints()
    localStorage.setItem(GRAMMAR_IGNORED_STORAGE_KEY, json)
  } catch (error) {
    console.warn('[grammar] Could not persist ignored lints:', error)
  }
}

async function restoreDictionaryWords(linter: Linter): Promise<void> {
  if (typeof localStorage === 'undefined') return
  try {
    const stored = localStorage.getItem(GRAMMAR_DICTIONARY_STORAGE_KEY)
    if (!stored) return
    const words = JSON.parse(stored)
    if (Array.isArray(words) && words.length > 0) {
      await linter.importWords(words.filter((word): word is string => typeof word === 'string'))
    }
  } catch (error) {
    console.warn('[grammar] Could not restore dictionary words:', error)
  }
}

const persistDictionaryWords = async (linter: Linter): Promise<void> => {
  if (typeof localStorage === 'undefined') return
  try {
    const words = await linter.exportWords()
    localStorage.setItem(GRAMMAR_DICTIONARY_STORAGE_KEY, JSON.stringify(words))
  } catch (error) {
    console.warn('[grammar] Could not persist dictionary words:', error)
  }
}

/** True when the engine failed to load — callers should stop scheduling work. */
export function isGrammarEngineUnavailable(): boolean {
  return linterUnavailable
}

/**
 * The shared linter, created on first call. Returns `null` when Harper cannot
 * be loaded (the failure is logged once and remembered).
 */
export async function getGrammarLinter(): Promise<Linter | null> {
  if (linterUnavailable) return null

  if (!linterPromise) {
    linterPromise = createLinter()
      .then(async (linter) => {
        await restoreIgnoredLints(linter)
        await restoreDictionaryWords(linter)
        return linter
      })
      .catch((error) => {
        linterUnavailable = true
        linterPromise = null
        console.error('[grammar] Harper failed to load:', error)
        throw error
      })
  }

  try {
    return await linterPromise
  } catch {
    return null
  }
}

/**
 * Warm the engine up while the user is doing something else (opening a note).
 * `setup()` compiles the WebAssembly and builds the curated dictionary — by
 * far the most expensive step — so the first lint does not have to pay for it.
 */
export async function preloadGrammarEngine(): Promise<void> {
  const linter = await getGrammarLinter()
  if (!linter) return

  try {
    await linter.setup()
  } catch (error) {
    console.warn('[grammar] Engine setup failed:', error)
  }
}

/**
 * Lint plain prose.
 *
 * `isolateEnglish` stays off: Harper's isolation pass is marked "proof of
 * concept" and reliably loses real problems in ordinary English (lowercase
 * "i", missing apostrophes, misspelled words) — see the tests/harness notes.
 * Blocks that are clearly *not* English are filtered out by
 * {@link isNonEnglishText} before they ever reach the linter.
 */
export async function lintPlainText(
  text: string,
  options?: LintOptions
): Promise<Lint[]> {
  const linter = await getGrammarLinter()
  if (!linter) return []

  try {
    return await linter.lint(text, {
      language: 'plaintext',
      isolateEnglish: false,
      ...options,
    })
  } catch (error) {
    console.error('[grammar] Lint pass failed:', error)
    return []
  }
}

/**
 * Best-effort "this block is not English" test, used to keep German/French/…
 * notes from drowning in spelling lints.
 *
 * Both Harper heuristics are proof-of-concept, so they are only trusted when
 * they agree *and* the text is long enough to judge (short fragments are
 * routinely misclassified — "Milk and honney" reads as non-English). Anything
 * uncertain is linted: missing a real error is worse than a stray squiggle.
 */
export async function isNonEnglishText(text: string): Promise<boolean> {
  const MIN_LANGUAGE_DETECTION_CHARS = 80
  if (text.length < MIN_LANGUAGE_DETECTION_CHARS) return false

  const linter = await getGrammarLinter()
  if (!linter) return false

  try {
    if (await linter.isLikelyEnglish(text)) return false
    const isolated = await linter.isolateEnglish(text)
    return isolated.trim().length === 0
  } catch {
    return false
  }
}

/**
 * Remember that the user never wants to see this lint again (session + across
 * restarts). `sourceText` must be the exact string that was linted.
 *
 * Note that Harper ignores are context-sensitive: editing the surrounding text
 * makes the lint eligible again. For names and jargon, add the word to the
 * dictionary instead — see {@link addWordToDictionary}.
 */
export async function ignoreLintPersistently(sourceText: string, lint: Lint): Promise<void> {
  const linter = await getGrammarLinter()
  if (!linter) return

  try {
    await linter.ignoreLint(sourceText, lint)
    await persistIgnoredLints(linter)
  } catch (error) {
    console.warn('[grammar] Could not ignore lint:', error)
  }
}

/**
 * Teach Harper a word for good (names, product names, jargon). Applies to every
 * note — the added words live in the user dictionary, not in the note.
 */
export async function addWordToDictionary(word: string): Promise<void> {
  const linter = await getGrammarLinter()
  if (!linter) return

  try {
    await linter.importWords([word])
    await persistDictionaryWords(linter)
  } catch (error) {
    console.warn('[grammar] Could not add word to the dictionary:', error)
  }
}
