import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.tsx'
import SessionExpiryToaster from './components/SessionExpiryToaster.tsx'
import BackendStatusToaster from './components/BackendStatusToaster.tsx'
import { GlobalStateProvider } from './context/GlobalStateContext.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { ToastProvider } from './context/ToastContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalStateProvider>
      <AuthProvider>
        <ToastProvider>
          <SessionExpiryToaster />
          <BackendStatusToaster />
          <App />
        </ToastProvider>
      </AuthProvider>
    </GlobalStateProvider>
  </StrictMode>,
)
