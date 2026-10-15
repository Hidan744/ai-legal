import { Navigate, Route, Routes } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/layout/AppShell'
import { LandingPage } from '@/pages/LandingPage'
import { AuthPage } from '@/pages/AuthPage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ContractsPage } from '@/pages/ContractsPage'
import { CounterpartiesPage } from '@/pages/CounterpartiesPage'
import { RisksPage } from '@/pages/RisksPage'
import { DeadlinesPage } from '@/pages/DeadlinesPage'
import { SettingsPage } from '@/pages/SettingsPage'

function App() {
  return (
    <TooltipProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="contracts" element={<ContractsPage />} />
          <Route path="counterparties" element={<CounterpartiesPage />} />
          <Route path="risks" element={<RisksPage />} />
          <Route path="deadlines" element={<DeadlinesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TooltipProvider>
  )
}

export default App
