import { Component, type ErrorInfo, type ReactNode } from "react"

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

// Route-level error boundary: catches render-time crashes and shows a graceful
// brutalist fallback instead of a blank page (AGENTS.md §8 — UI error handling).
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Dashboard render error:", error, info.componentStack)
  }

  private handleReset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-md rounded-base border-2 border-border bg-secondary-background p-6 text-center shadow-shadow">
          <h2 className="font-heading text-2xl">Something broke 💥</h2>
          <p className="mt-2 text-sm text-foreground/70">{this.state.error.message}</p>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-4 rounded-base border-2 border-border bg-main px-4 py-2 font-heading uppercase shadow-shadow"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
