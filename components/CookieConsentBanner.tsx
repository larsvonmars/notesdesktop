'use client';

/**
 * MindViz Shared Cookie Consent Banner
 * ─────────────────────────────────────
 * Canonical source: shared/consent/CookieConsentBanner.tsx
 *
 * Deployed to every app in the MindViz suite. Do NOT edit project copies
 * directly — edit this file and run `node shared/consent/sync.js` to
 * propagate the update to all projects.
 *
 * localStorage key : mindviz-cookie-consent  ('all' | 'necessary')
 * DOM event        : mindviz-consent-updated  (fired after every choice)
 */

import { useState, useEffect } from 'react';

// ─── Public API ──────────────────────────────────────────────────────────────

export const CONSENT_KEY = 'mindviz-cookie-consent';
export type ConsentValue = 'all' | 'necessary';
export const CONSENT_UPDATED_EVENT = 'mindviz-consent-updated';

/** Returns the stored consent value, or null when the user has not yet chosen. */
export function getConsent(): ConsentValue | null {
  if (typeof window === 'undefined') return null;
  return (localStorage.getItem(CONSENT_KEY) as ConsentValue) ?? null;
}

// Backward-compatible aliases (used by CVBuilder's AdsenseScripts / AdBlock)
export const COOKIE_CONSENT_UPDATED_EVENT = CONSENT_UPDATED_EVENT;
export const getCookieConsent = getConsent;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConsentLabels {
  title?: string;
  description?: string;
  acceptAll?: string;
  necessaryOnly?: string;
  learnMore?: string;
  privacyPolicy?: string;
}

export interface CookieConsentBannerProps {
  /**
   * URL of the cookie / tracking policy page.
   * Omit (or pass undefined) to hide the "Cookie policy" link.
   */
  cookiePolicyUrl?: string;
  /**
   * URL of the privacy policy page.
   * Omit (or pass undefined) to hide the "Privacy policy" link.
   */
  privacyUrl?: string;
  /** Override any of the default English labels. */
  labels?: ConsentLabels;
}

const DEFAULT_LABELS: Required<ConsentLabels> = {
  title: 'We use cookies & local storage',
  description:
    'We use strictly necessary cookies for authentication and local storage to save your data. We may also use functional and advertising cookies to support and improve the service. "Accept All" consents to all cookies; "Necessary Only" limits storage to what is strictly required.',
  acceptAll: 'Accept All',
  necessaryOnly: 'Necessary Only',
  learnMore: 'Cookie policy',
  privacyPolicy: 'Privacy policy',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function CookieConsentBanner({
  cookiePolicyUrl,
  privacyUrl,
  labels = {},
}: CookieConsentBannerProps = {}) {
  const t = { ...DEFAULT_LABELS, ...labels };
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(CONSENT_KEY)) {
      setVisible(true);
    }
  }, []);

  function handleConsent(choice: ConsentValue) {
    localStorage.setItem(CONSENT_KEY, choice);
    window.dispatchEvent(new Event(CONSENT_UPDATED_EVENT));
    setVisible(false);
  }

  if (!visible) return null;

  const hasLinks = cookiePolicyUrl || privacyUrl;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4"
    >
      <div className="mx-auto max-w-5xl rounded-2xl border border-zinc-200 bg-white/95 shadow-2xl backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
          {/* Icon + text */}
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <svg
                className="h-5 w-5 shrink-0 text-green-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <circle cx="8" cy="9" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="15" cy="7" r="1" fill="currentColor" stroke="none" />
                <circle cx="15.5" cy="14" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="9" cy="15" r="1" fill="currentColor" stroke="none" />
                <circle cx="12" cy="11" r="0.75" fill="currentColor" stroke="none" />
              </svg>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {t.title}
              </h2>
            </div>
            <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              {t.description}
              {hasLinks && (
                <>
                  {' '}
                  {cookiePolicyUrl && (
                    <a
                      href={cookiePolicyUrl}
                      className="font-medium text-green-600 underline-offset-2 hover:underline dark:text-green-400"
                    >
                      {t.learnMore}
                    </a>
                  )}
                  {cookiePolicyUrl && privacyUrl && ' · '}
                  {privacyUrl && (
                    <a
                      href={privacyUrl}
                      className="font-medium text-green-600 underline-offset-2 hover:underline dark:text-green-400"
                    >
                      {t.privacyPolicy}
                    </a>
                  )}
                </>
              )}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => handleConsent('necessary')}
              className="rounded-lg border border-zinc-300 bg-transparent px-4 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-1 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:focus:ring-offset-zinc-900"
            >
              {t.necessaryOnly}
            </button>
            <button
              type="button"
              onClick={() => handleConsent('all')}
              className="rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 dark:focus:ring-offset-zinc-900"
            >
              {t.acceptAll}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
