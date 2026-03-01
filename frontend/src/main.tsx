import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { GlobalStateProvider } from './context/GlobalStateContext.tsx'
import { AuthProvider } from './context/AuthContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalStateProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </GlobalStateProvider>
  </StrictMode>,
)
