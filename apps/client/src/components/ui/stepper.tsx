type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** How to show the value, e.g. "15:00" or "60 s". */
  format?: (value: number) => string;
  onChange?: (value: number) => void;
  disabled?: boolean;
  testId?: string;
};

export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  format = String,
  onChange,
  disabled = false,
  testId,
}: Props) {
  const set = (v: number) => onChange?.(Math.min(max, Math.max(min, v)));
  return (
    <div className="stepper" data-testid={testId}>
      <span className="stepper__label">{label}</span>
      <div className="stepper__controls">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={disabled || value <= min}
          onClick={() => set(value - step)}
        >
          −
        </button>
        <output className="stepper__value ket" aria-label={label}>
          {format(value)}
        </output>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={disabled || value >= max}
          onClick={() => set(value + step)}
        >
          +
        </button>
      </div>
    </div>
  );
}
