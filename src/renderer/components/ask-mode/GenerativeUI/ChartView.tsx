import React, { useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

export interface ChartDataPoint {
  name: string;
  value: number;
  category?: string;
}

interface ChartViewProps {
  chartType: 'bar' | 'line' | 'area' | 'pie';
  data: ChartDataPoint[];
  title?: string;
  description?: string;
  xKey?: string;
  yKey?: string;
}

const CHART_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
];

/**
 * Tick and legend labels are text, so they sit on the 12px floor. A Recharts prop is invisible
 * to the token-drift grep — that is exactly why the size lives in one named constant here rather
 * than in six `fontSize: 11` literals that no gate can see.
 */
const AXIS_TICK_STYLE = { fontSize: 12, fill: 'var(--muted-foreground)' };
const LEGEND_STYLE = { fontSize: 12, color: 'var(--muted-foreground)' };

function EmptyChart() {
  return (
    <div className="chart-empty" role="status">
      <p>No data available for visualization</p>
    </div>
  );
}

function SingleValueCard({ item, title }: { item: ChartDataPoint; title?: string }) {
  return (
    <div className="chart-container">
      {title && <h3 className="generative-ui-title">{title}</h3>}
      <div className="chart-single-value">
        <span className="chart-value-label">{item.name}</span>
        <span className="chart-value-number">{item.value.toLocaleString()}</span>
      </div>
    </div>
  );
}

function ErrorFallback({ chartType, dataCount }: { chartType: string; dataCount: number }) {
  return (
    <div className="generative-ui-fallback" role="alert" aria-live="assertive">
      <p>Failed to render chart visualization</p>
      <pre>{JSON.stringify({ chartType, dataCount }, null, 2)}</pre>
    </div>
  );
}

function BarChartView({ data, xKey, yKey }: { data: ChartDataPoint[]; xKey: string; yKey: string }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
        <XAxis dataKey={xKey} tick={AXIS_TICK_STYLE} />
        <YAxis tick={AXIS_TICK_STYLE} />
        <Tooltip
          contentStyle={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            color: 'var(--foreground)',
          }}
        />
        <Bar dataKey={yKey} fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function LineChartView({ data, xKey, yKey }: { data: ChartDataPoint[]; xKey: string; yKey: string }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
        <XAxis dataKey={xKey} tick={AXIS_TICK_STYLE} />
        <YAxis tick={AXIS_TICK_STYLE} />
        <Tooltip
          contentStyle={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            color: 'var(--foreground)',
          }}
        />
        <Line
          type="monotone"
          dataKey={yKey}
          stroke="var(--color-chart-1)"
          strokeWidth={2}
          dot={{ fill: 'var(--color-chart-1)', r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function AreaChartView({ data, xKey, yKey }: { data: ChartDataPoint[]; xKey: string; yKey: string }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
        <XAxis dataKey={xKey} tick={AXIS_TICK_STYLE} />
        <YAxis tick={AXIS_TICK_STYLE} />
        <Tooltip
          contentStyle={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            color: 'var(--foreground)',
          }}
        />
        <Area
          type="monotone"
          dataKey={yKey}
          stroke="var(--color-chart-1)"
          strokeWidth={2}
          fill="url(#areaGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function PieChartView({ data }: { data: ChartDataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
          outerRadius={90}
          fill="var(--color-chart-1)"
          dataKey="value"
        >
          {data.map((_entry, index) => (
            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            color: 'var(--foreground)',
          }}
        />
        <Legend
          wrapperStyle={LEGEND_STYLE}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ChartView({ chartType, data, title, description, xKey = 'name', yKey = 'value' }: ChartViewProps) {
  const validData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.filter((d) => typeof d.value === 'number' && isFinite(d.value));
  }, [data]);

  if (validData.length === 0) {
    return <EmptyChart />;
  }

  if (validData.length === 1) {
    return <SingleValueCard item={validData[0]} title={title} />;
  }

  const renderChart = () => {
    try {
      switch (chartType) {
        case 'bar':
          return <BarChartView data={validData} xKey={xKey} yKey={yKey} />;
        case 'line':
          return <LineChartView data={validData} xKey={xKey} yKey={yKey} />;
        case 'area':
          return <AreaChartView data={validData} xKey={xKey} yKey={yKey} />;
        case 'pie':
          return <PieChartView data={validData} />;
        default:
          return <BarChartView data={validData} xKey={xKey} yKey={yKey} />;
      }
    } catch {
      return <ErrorFallback chartType={chartType} dataCount={validData.length} />;
    }
  };

  return (
    <div className="generative-ui-container chart-container" role="img" aria-label={`${chartType} chart: ${title || 'Data visualization'}`}>
      {title && <h3 className="generative-ui-title">{title}</h3>}
      {description && <p className="chart-description">{description}</p>}
      <div className="chart-area">
        {renderChart()}
      </div>
    </div>
  );
}
