'use client';

import { useState } from 'react';
import { Copy, CheckCircle2 } from 'lucide-react';

/**
 * Code-snippet wrapper used across the /docs page. Renders a labelled
 * card with a syntax-hinted language badge + a one-click copy button.
 * We deliberately don't import a heavy syntax-highlighter — the dark
 * theme + monospace tabular formatting is enough for ~5-line snippets,
 * and integrators are going to paste into their own IDE anyway.
 */
export function CodeBlock({
  children,
  label,
  language,
}: {
  children: string;
  label?: string;
  language?: 'ts' | 'js' | 'solidity' | 'bash';
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-bg-base/60 backdrop-blur">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-bg-surface/30 px-4 py-2">
        <div className="flex items-center gap-2">
          {language && (
            <span className="rounded-md border border-brand-400/30 bg-brand-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-brand-400">
              {language}
            </span>
          )}
          {label && (
            <span className="text-xs font-medium text-ink-muted">{label}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-base/60 px-2 py-1 text-[10px] uppercase tracking-wider text-ink-muted transition-colors hover:border-brand-400/40 hover:text-ink"
        >
          {copied ? (
            <>
              <CheckCircle2 size={11} className="text-brand-400" />
              Copied
            </>
          ) : (
            <>
              <Copy size={11} />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-[12px] leading-relaxed text-ink/90">
        <code className="font-mono">{children}</code>
      </pre>
    </div>
  );
}
