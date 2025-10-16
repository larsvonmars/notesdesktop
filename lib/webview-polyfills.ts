/**
 * Polyfills for WebView and Tauri compatibility
 * This file provides fallbacks for APIs that may not be available in all WebView implementations
 */

/**
 * Polyfill for CSS.escape() which may not be available in older WebView versions
 * Based on https://drafts.csswg.org/cssom/#the-css.escape%28%29-method
 */
export function ensureCSSEscape(): void {
  if (typeof window === 'undefined' || typeof CSS === 'undefined') {
    return
  }

  if (!CSS.escape) {
    CSS.escape = function(value: string): string {
      if (arguments.length === 0) {
        throw new TypeError('`CSS.escape` requires an argument.')
      }
      const string = String(value)
      const length = string.length
      let index = -1
      let codeUnit
      let result = ''
      const firstCodeUnit = string.charCodeAt(0)
      
      while (++index < length) {
        codeUnit = string.charCodeAt(index)
        
        // Note: there's no need to special-case astral symbols, surrogate
        // pairs, or newline escapes since they're not valid CSS identifiers anyway
        
        if (codeUnit === 0x0000) {
          result += '\uFFFD'
          continue
        }
        
        if (
          // If the character is in the range [\1-\1F] (U+0001 to U+001F) or is U+007F
          (codeUnit >= 0x0001 && codeUnit <= 0x001F) || codeUnit === 0x007F ||
          // If the character is the first character and is in the range [0-9] (U+0030 to U+0039)
          (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
          // If the character is the second character and is in the range [0-9] (U+0030 to U+0039)
          // and the first character is a `-` (U+002D)
          (
            index === 1 &&
            codeUnit >= 0x0030 && codeUnit <= 0x0039 &&
            firstCodeUnit === 0x002D
          )
        ) {
          result += '\\' + codeUnit.toString(16) + ' '
          continue
        }
        
        if (
          // If the character is the first character and is a `-` (U+002D), and
          // there is no second character, escape it
          index === 0 &&
          length === 1 &&
          codeUnit === 0x002D
        ) {
          result += '\\' + string.charAt(index)
          continue
        }
        
        // If the character is not handled by one of the above rules and is
        // greater than or equal to U+0080, is `-` (U+002D) or `_` (U+005F), or
        // is in one of the ranges [0-9] (U+0030 to U+0039), [A-Z] (U+0041 to
        // U+005A), or [a-z] (U+0061 to U+007A), the character itself
        if (
          codeUnit >= 0x0080 ||
          codeUnit === 0x002D ||
          codeUnit === 0x005F ||
          codeUnit >= 0x0030 && codeUnit <= 0x0039 ||
          codeUnit >= 0x0041 && codeUnit <= 0x005A ||
          codeUnit >= 0x0061 && codeUnit <= 0x007A
        ) {
          result += string.charAt(index)
          continue
        }
        
        // Otherwise, escape the character
        result += '\\' + string.charAt(index)
      }
      
      return result
    }
  }
}

/**
 * Initialize all polyfills
 * Call this early in the application lifecycle
 */
export function initializeWebViewPolyfills(): void {
  ensureCSSEscape()
}

/**
 * Check if we're running in a Tauri environment
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window
}

/**
 * Safe wrapper for window.getSelection that handles WebView quirks
 */
export function safeGetSelection(): Selection | null {
  if (typeof window === 'undefined') return null
  
  try {
    return window.getSelection()
  } catch (e) {
    console.warn('window.getSelection() failed:', e)
    return null
  }
}

/**
 * Safe wrapper for document.queryCommandState with WebView fallback
 */
export function safeQueryCommandState(command: string): boolean {
  if (typeof document === 'undefined') return false
  
  try {
    // In some WebViews, queryCommandState might not exist or might be unreliable
    if (typeof document.queryCommandState === 'function') {
      return document.queryCommandState(command)
    }
    return false
  } catch (e) {
    console.warn(`document.queryCommandState('${command}') failed:`, e)
    return false
  }
}
