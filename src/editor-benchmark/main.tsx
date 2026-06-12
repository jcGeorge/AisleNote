import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorBenchmarkApp } from './editor-benchmark-app'
import './editor-benchmark.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Editor benchmark root element was not found.')
}

createRoot(rootElement).render(
  <StrictMode>
    <EditorBenchmarkApp />
  </StrictMode>,
)
