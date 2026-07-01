import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

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
        <Card className="mx-auto max-w-md bg-secondary-background text-center">
          <CardContent className="space-y-3">
            <h2 className="flex items-center justify-center gap-2 font-heading text-2xl">
              <AlertTriangle className="size-6" /> Something broke
            </h2>
            <p className="text-sm text-foreground/70">{this.state.error.message}</p>
            <Button type="button" onClick={this.handleReset} className="font-heading uppercase">
              Try again
            </Button>
          </CardContent>
        </Card>
      )
    }
    return this.props.children
  }
}
