import React, { useMemo } from 'react'
import { ScatterChart, XAxis, YAxis, ZAxis, Tooltip, Scatter, ResponsiveContainer } from 'recharts'
import type { HeatmapResult } from '@/worker/client'
import { heatColor, clamp01 } from '@/app/utils/colors'

export interface LetterHeatmapProps {
  result: HeatmapResult
  height?: number
  colorblind?: boolean
}

// Build data array suitable for a scatter heatmap. Each cell => one point with z value as probability mass.
export const LetterHeatmap: React.FC<LetterHeatmapProps> = ({ result, height = 420, colorblind = false }) => {
  const { length: L, mass, letterIndex } = result

  const data = useMemo(() => {
    const rows: Array<{ x: number; y: number; z: number; letter: string; pos: number }> = []
    for (let y = 0; y < letterIndex.length; y++) {
      for (let x = 0; x < L; x++) {
        const z = mass[x]?.[y] ?? 0
        rows.push({ x: x + 1, y, z, letter: letterIndex[y]!, pos: x + 1 })
      }
    }
    return rows
  }, [L, mass, letterIndex])

  const maxZ = useMemo(() => data.reduce((m, d) => (d.z > m ? d.z : m), 0), [data])

  if (L === 0) return <div style={{ fontSize: '0.75rem', color: '#666' }}>No data</div>

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <ScatterChart
          margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
        >
          <XAxis
            type="number"
            dataKey="x"
            name="Position"
            domain={[1, L]}
            ticks={Array.from({ length: L }, (_, i) => i + 1)}
            tick={{ fontSize: 11 }}
            label={{ value: 'Position', offset: -4, position: 'insideBottom' }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Letter"
            domain={[0, letterIndex.length - 1]}
            ticks={Array.from({ length: letterIndex.length }, (_, i) => i)}
            tickFormatter={(v) => letterIndex[v] || ''}
            tick={{ fontSize: 11 }}
            label={{ value: 'Letter', angle: -90, position: 'insideLeft' }}
          />
          <ZAxis type="number" dataKey="z" range={[0, 1]} name="Mass" />
          <Tooltip
            cursor={{ stroke: '#999', strokeWidth: 1 }}
            formatter={(value: any) => {
              const massVal = typeof value === 'number' ? value : 0
              return [massVal.toFixed(3), `mass`]
            }}
            labelFormatter={() => ''}
            contentStyle={{ fontSize: '0.7rem' }}
          />
          <Scatter
            data={data}
            shape={(props: any) => {
              const { cx, cy, payload } = props
              const zNorm = maxZ > 0 ? payload.z / maxZ : 0
              const fill = heatColor(clamp01(zNorm))
              const cellSize = Math.min(32, Math.max(8, 560 / L))
              const mass = payload.z as number
              return (
                <g aria-label={`pos ${payload.pos} letter ${payload.letter} mass ${mass.toFixed(3)}`}>
                  <rect
                    x={cx - cellSize / 2}
                    y={cy - cellSize / 2}
                    width={cellSize}
                    height={cellSize}
                    fill={fill}
                    stroke={colorblind ? 'black' : 'rgba(0,0,0,0.05)'}
                    strokeWidth={colorblind ? 0.5 : 1}
                  >
                    <title>{`pos ${payload.pos}, letter ${payload.letter}, mass ${mass.toFixed(4)}`}</title>
                  </rect>
                  {colorblind && cellSize >= 16 && (
                    <text
                      x={cx}
                      y={cy + 3}
                      textAnchor="middle"
                      fontSize={Math.max(8, cellSize * 0.42)}
                      fill={zNorm > 0.6 ? '#000' : '#111'}
                      style={{ pointerEvents: 'none' }}
                    >
                      {mass.toFixed(mass >= 0.1 ? 2 : 3).replace(/^0+/, '')}
                    </text>
                  )}
                </g>
              )
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>
      <div style={{ textAlign: 'right', fontSize: '0.6rem', color: '#555', marginTop: 4 }}>
        Max cell mass: {maxZ.toFixed(3)}
      </div>
    </div>
  )
}

export default LetterHeatmap
