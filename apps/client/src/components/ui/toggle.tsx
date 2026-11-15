type Props = {
  label: string;
  checked: boolean;
  onChange?: (value: boolean) => void;
  disabled?: boolean;
};

export function Toggle({ label, checked, onChange, disabled = false }: Props) {
  return (
    <label className={`toggle${disabled ? ' toggle--disabled' : ''}`}>
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={`toggle__track${checked ? ' toggle__track--on' : ''}`}
        onClick={() => onChange?.(!checked)}
      >
        <span className="toggle__thumb" />
      </button>
    </label>
  );
}
