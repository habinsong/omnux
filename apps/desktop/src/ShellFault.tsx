type ShellFaultProps = {
  label: string;
  stack?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
};

export function ShellFault({ label, stack, onRetry, retryLabel = "다시 렌더" }: ShellFaultProps) {
  return (
    <div className="section-error" role="alert">
      <p>{label}</p>
      {stack ? <pre className="error-stack">{stack}</pre> : null}
      {onRetry ? (
        <button className="secondary-button" type="button" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
