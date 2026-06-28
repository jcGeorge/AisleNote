import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'bootstrap/dist/css/bootstrap.min.css'
import './index.css'
import App from './App.tsx'
import { PrintAisleDocument } from './print/PrintAisleDocument.tsx'

const isPrintAisleMode = new URLSearchParams(window.location.search).get('print') === 'aisle'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPrintAisleMode ? <PrintAisleDocument /> : <App />}
  </StrictMode>,
)
