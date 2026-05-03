import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import AppBootstrap from './components/layout/AppBootstrap'
import AppLayout from './components/layout/AppLayout'
import BudgetsPage from './pages/Budgets/BudgetsPage'
import Dashboard from './pages/Dashboard/Dashboard'
import CategoriesPage from './pages/Settings/CategoriesPage'
import SettingsPage from './pages/Settings/SettingsPage'
import SplitsPage from './pages/Splits/SplitsPage'
import TransactionsPage from './pages/Transactions/TransactionsPage'

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/transactions', element: <TransactionsPage /> },
      { path: '/budgets', element: <BudgetsPage /> },
      { path: '/splits', element: <SplitsPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/settings/categories', element: <CategoriesPage /> },
    ],
  },
])

export default function App() {
  return (
    <AppBootstrap>
      <RouterProvider router={router} />
    </AppBootstrap>
  )
}
