import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  /** Shown instead of the children when they fail to render. */
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * Keeps one optional panel (currently the Leaflet map) from taking the whole
 * console down if it fails to initialise. React still needs a class component
 * for this; nothing else here is class-based.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No secrets are logged: this is a client-side rendering failure only.
    console.error("A dashboard panel failed to render", error.message, info.componentStack);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
