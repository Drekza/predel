import { formatDateShort, formatNumber, parseDateKey } from '@/lib/format'

import { buildChart, type WeightPoint } from './series'

/** Больше этого числа точек — кружки сливаются в бусы, оставляем одну линию. */
const DOTS_LIMIT = 40

type WeightChartProps = {
  /** Точки по возрастанию даты. */
  points: readonly WeightPoint[]
}

/**
 * График веса напечатан на пластине: чёрным по светлому, как и все остальные
 * числа станции. Линия — киноварь, ей же ставится клеймо на последнем
 * измерении: глаз ищет именно его.
 *
 * SVG рукописный, без библиотеки графиков: одна ломаная на семи точках не
 * стоит двухсот килобайт рантайма, а стиль иначе не удержать.
 */
export function WeightChart({ points }: WeightChartProps) {
  const chart = buildChart(points)
  if (!chart) return null

  const last = chart.points[chart.points.length - 1]
  const first = chart.points[0]
  if (!last || !first) return null

  const plotRight = chart.width - 40
  const label =
    `График веса тела: ${chart.points.length} ` +
    `${chart.points.length === 1 ? 'измерение' : 'измерений'}, ` +
    `от ${formatNumber(chart.min, 1)} до ${formatNumber(chart.max, 1)} кг`

  return (
    <div className="plate rounded-sm px-3 pt-2.5 pb-2">
      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        className="block w-full"
        role="img"
        aria-label={label}
      >
        {chart.gridY.map((y) => (
          <line
            key={y}
            x1={0}
            x2={plotRight}
            y1={y}
            y2={y}
            className="stroke-plate-etch"
            strokeWidth={0.75}
          />
        ))}

        <path d={chart.area} className="fill-stamp" opacity={0.12} />
        <path
          d={chart.line}
          className="stroke-stamp"
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {chart.points.length <= DOTS_LIMIT
          ? chart.points.map((point) => (
              <circle
                key={point.date}
                cx={point.x}
                cy={point.y}
                r={2}
                className="fill-plate stroke-stamp"
                strokeWidth={1.2}
              />
            ))
          : null}

        {/* Клеймо на последнем измерении. */}
        <circle cx={last.x} cy={last.y} r={3.4} className="fill-stamp" />

        <text
          x={plotRight + 6}
          y={(chart.gridY[0] ?? 0) + 3}
          className="num fill-plate-muted"
          fontSize={9}
        >
          {formatNumber(chart.max, 1)}
        </text>
        <text
          x={plotRight + 6}
          y={(chart.gridY[2] ?? 0) + 3}
          className="num fill-plate-muted"
          fontSize={9}
        >
          {formatNumber(chart.min, 1)}
        </text>
      </svg>

      {/* Края периода подписаны настоящим текстом, а не масштабируемым SVG. */}
      <div className="num flex justify-between pr-8 text-[0.625rem] text-plate-muted">
        <span>{formatDateShort(parseDateKey(first.date))}</span>
        {chart.points.length > 1 ? <span>{formatDateShort(parseDateKey(last.date))}</span> : null}
      </div>
    </div>
  )
}
