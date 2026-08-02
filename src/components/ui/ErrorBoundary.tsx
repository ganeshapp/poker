import { Component, type ReactNode } from "react";

/* Last line of defense: a render crash shows this card instead of
   silently unmounting the whole app into a blank window. */

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Render crash caught by ErrorBoundary:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid h-screen w-screen place-items-center bg-ink-900 p-8">
        <div className="max-w-[440px] rounded-2xl border border-bad/40 bg-ink-800 p-6 text-center">
          <div className="font-display text-xl font-bold text-[var(--text)]">Something broke</div>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            A part of the interface crashed. Your hands, stats, and progress are safe — reloading
            usually fixes it.
          </p>
          <p className="mono mt-3 max-h-24 overflow-auto rounded-lg bg-ink-850 p-2 text-left text-[0.7rem] text-bad">
            {String(this.state.error?.message ?? this.state.error)}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl bg-gold px-5 py-2 text-sm font-bold text-ink-900 transition hover:brightness-110"
          >
            Reload the app
          </button>
        </div>
      </div>
    );
  }
}
