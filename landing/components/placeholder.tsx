// Visually marks a value that still needs to be filled in on the legal pages,
// so it's easy to spot every open field before publishing. Remove the wrapper
// (keep the text) once the real value is in place.
export function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded bg-warning/40 px-1 text-neutral-900"
      title="Bitte ergänzen"
    >
      {children}
    </span>
  );
}
