// Lexical wraps every block (decorator) in this boundary. The stock one hands
// the error back to the editor, which then tears the whole editor down; here a
// block that crashes only shows a small message in its own place, and the rest
// of the document keeps working.

import { Component } from 'react'
import type { ReactElement } from 'react'

interface Props { children: ReactElement; onError: (error: Error) => void }

export class BlockErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    console.error('A block failed to render:', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="block-error" contentEditable={false} role="alert">
        This block could not be shown.{' '}
        <button type="button" onClick={() => this.setState({ failed: false })}>Try again</button>
      </div>
    )
  }
}
