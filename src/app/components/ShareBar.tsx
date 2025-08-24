import { useState } from 'react'
import { makeShareURL } from '@/app/seed'
import type { GuessEntry } from '@/app/state/session'

export function ShareBar(props: { length: number; attemptsMax: number; history: GuessEntry[] }) {
  const [copied, setCopied] = useState<null | string>(null)
  const onCopy = async () => {
    const url = makeShareURL({
      length: props.length,
      attemptsMax: props.attemptsMax,
      history: props.history,
    })
    try {
      await navigator.clipboard.writeText(url)
      setCopied('Link copied!')
    } catch {
      setCopied('Copy failed — long-press to copy')
    }
    setTimeout(() => setCopied(null), 1500)
  }
  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        type="button"
        onClick={onCopy}
        className="px-3 py-1 rounded-md bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600"
      >
        Share session link
      </button>
      {copied && <span className="text-neutral-500 dark:text-neutral-400">{copied}</span>}
    </div>
  )
}
