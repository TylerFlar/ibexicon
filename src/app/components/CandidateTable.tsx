import React, { useMemo } from 'react'

export interface CandidateTableProps {
  words: string[]
  priors: Record<string, number>
  maxRows?: number
}

export const CandidateTable: React.FC<CandidateTableProps> = ({ words, priors, maxRows = 500 }) => {
  const rows = useMemo(() => {
    const list = words.map((w) => ({ w, p: priors[w] || 0 }))
    list.sort((a, b) => b.p - a.p)
    return list.slice(0, maxRows)
  }, [words, priors, maxRows])

  if (!words.length) return <div className="text-xs text-neutral-500">No candidates.</div>

  return (
    <div className="overflow-auto max-h-80 border border-neutral-300 dark:border-neutral-700 rounded-md">
      <table className="w-full text-[0.65rem]">
        <thead className="bg-neutral-100 dark:bg-neutral-800 sticky top-0">
          <tr>
            <th className="text-left p-1 font-semibold">Word</th>
            <th className="text-right p-1 font-semibold">Mass</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.w} className="odd:bg-neutral-50 dark:odd:bg-neutral-900/30">
              <td className="p-1 font-mono">{r.w}</td>
              <td className="p-1 text-right tabular-nums">{r.p.toExponential(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {words.length > rows.length && (
        <div className="p-1 text-[0.55rem] text-neutral-500 text-right">
          Showing top {rows.length} / {words.length}
        </div>
      )}
    </div>
  )
}

export default CandidateTable
