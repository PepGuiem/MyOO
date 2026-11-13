import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** Qué pintar si algo dentro falla. */
  fallback: ReactNode;
  /** Aviso opcional (por ejemplo, para mostrar un mensaje fuera del 3D). */
  onError?: (error: Error) => void;
  /** Si cambia, se vuelve a intentar (por ejemplo, otra URL de modelo). */
  resetKey?: unknown;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Captura errores de sus hijos (incluida la carga de un modelo 3D que falla)
 * y muestra `fallback` en lugar de romper toda la página.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error);
    if (import.meta.env.DEV) console.warn('[ErrorBoundary]', error.message, info.componentStack);
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
