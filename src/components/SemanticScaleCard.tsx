import React, { useCallback, useMemo } from 'react';

export type SemanticScaleCardProps = {
  left: string;
  right: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function computePercent(value: number, min: number, max: number) {
  if (max === min) return 0;
  const v = clamp(value, min, max);
  return ((v - min) / (max - min)) * 100;
}

export default function SemanticScaleCard({ left, right, value, min = -3, max = 3, onChange }: SemanticScaleCardProps) {
  const pct = useMemo(() => computePercent(value, min, max), [value, min, max]);
  const hue = useMemo(() => 220 - (220 * pct) / 100, [pct]);
  const barStyle = {
    width: `${pct}%`,
    backgroundColor: `hsl(${hue} 80% 50%)`,
  } as React.CSSProperties;

  const dec = useCallback(() => onChange(clamp(value - 1, min, max)), [onChange, value, min, max]);
  const inc = useCallback(() => onChange(clamp(value + 1, min, max)), [onChange, value, min, max]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === '-') {
      e.preventDefault();
      dec();
    } else if (e.key === 'ArrowRight' || e.key === '+') {
      e.preventDefault();
      inc();
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(min);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(max);
    }
  };

  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

  return (
    <div
      role="group"
      aria-label={`${left} to ${right}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="rounded-md border border-gray-200 bg-white p-3 shadow-sm w-full max-w-md"
    >
      {rtl ? (
        <div className="flex items-center justify-between mb-2 text-sm text-gray-700">
          <span>{right}</span>
          <span>{left}</span>
        </div>
      ) : (
        <div className="flex items-center justify-between mb-2 text-sm text-gray-700">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease toward ${left}`}
          onClick={dec}
          className="inline-flex items-center justify-center h-8 w-8 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          –
        </button>
        <div className="relative grow h-3 rounded bg-gray-100 overflow-hidden" aria-label="Progress" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} role="progressbar">
          <div className="absolute left-0 top-0 bottom-0" style={barStyle} />
        </div>
        <button
          type="button"
          aria-label={`Increase toward ${right}`}
          onClick={inc}
          className="inline-flex items-center justify-center h-8 w-8 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          +
        </button>
        <div className="w-14 text-right text-sm font-medium tabular-nums" aria-label="Percent">
          {pct.toFixed(0)}%
        </div>
      </div>
    </div>
  );
}
