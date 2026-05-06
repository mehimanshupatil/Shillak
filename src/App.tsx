import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import AppBootstrap from './components/layout/AppBootstrap'
import AppLayout from './components/layout/AppLayout'
import BudgetsPage from './pages/Budgets/BudgetsPage'
import Dashboard from './pages/Dashboard/Dashboard'
import AccountsPage from './pages/Settings/AccountsPage'
import CategoriesPage from './pages/Settings/CategoriesPage'
import SettingsPage from './pages/Settings/SettingsPage'
import ShareTargetPage from './pages/ShareTarget/ShareTargetPage'
import TransactionsPage from './pages/Transactions/TransactionsPage'

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/transactions', element: <TransactionsPage /> },
      { path: '/budgets', element: <BudgetsPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/settings/categories', element: <CategoriesPage /> },
      { path: '/settings/accounts', element: <AccountsPage /> },
      { path: '/share-target', element: <ShareTargetPage /> },
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
