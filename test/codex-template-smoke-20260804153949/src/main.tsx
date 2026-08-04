import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initFreelogApp } from 'freelog-runtime'

let root: ReturnType<typeof createRoot> | null = null

window.mount = () => {
  initFreelogApp()
  root = createRoot(document.getElementById('root')!)
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

window.unmount = () => {
  root?.unmount()
  root = null
}
