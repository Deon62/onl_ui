import { Navigate, Route, Routes } from 'react-router-dom'
import {
  Activity, ArrowLeftRight, Inbox, Banknote, BarChart3, Building2, HelpCircle, LayoutDashboard,
  Landmark, Link2, MessageSquare, Network, Percent, Radio, Receipt, Scale, Settings, TrendingUp, UserRound, Wallet,
} from 'lucide-react'
import { useStore } from './store/AppStore'
import { AppShell, type NavSection } from './components/shared/Layout'
import { LoginPage } from './pages/Login'
import { AdminDashboard } from './components/admin/AdminDashboard'
import { MerchantsPage } from './components/admin/MerchantsPage'
import { MerchantDetailPage } from './components/admin/MerchantDetailPage'
import { RequestsPage } from './components/admin/RequestsPage'
import { AdminTransactionsPage } from './components/admin/TransactionsPage'
import { CollectionsPage } from './components/admin/CollectionsPage'
import { AdminPayoutsPage } from './components/admin/PayoutsPage'
import { ReconciliationPage } from './components/admin/ReconciliationPage'
import { RevenuePage } from './components/admin/RevenuePage'
import { ExpensesPage } from './components/admin/ExpensesPage'
import { FeesPage } from './components/admin/FeesPage'
import { ReportsPage } from './components/admin/ReportsPage'
import { ChannelsPage } from './components/admin/ChannelsPage'
import { ActivityPage } from './components/admin/ActivityPage'
import { AdminSettingsPage } from './components/admin/SettingsPage'
import { MerchantDashboard } from './components/merchant/MerchantDashboard'
import { MerchantTransactionsPage } from './components/merchant/MerchantTransactionsPage'
import { PaymentLinksPage } from './components/merchant/PaymentLinksPage'
import { MerchantPayoutsPage } from './components/merchant/MerchantPayoutsPage'
import { BusinessProfilePage } from './components/merchant/BusinessProfilePage'
import { MerchantSettingsPage } from './components/merchant/MerchantSettingsPage'
import { HelpPage } from './components/merchant/HelpPage'
import { SmsPage } from './components/merchant/SmsPage'
import { SettlementPage } from './components/merchant/SettlementPage'
import { MerchantSidebarCard } from './components/merchant/MerchantChrome'
import { PageSpinner } from './components/shared/PageSkeletons'

/** Live mode: hold the layout until the first load from the API has finished. */
function Connecting() {
  return <div className="flex min-h-screen items-center justify-center"><PageSpinner label="Connecting to Oryne" /></div>
}

function AdminLayout() {
  const { session, data, ready } = useStore()
  if (!session) return <Navigate to="/login" replace />
  if (!ready) return <Connecting />
  if (session.role === 'merchant') return <Navigate to="/merchant" replace />
  const unmatched = data.transactions.filter((t) => t.status === 'Unmatched').length
  const newRequests = (data.accessRequests ?? []).filter((r) => r.status === 'New').length
  const pendingPayouts = data.payouts.filter((p) => p.status === 'Pending').length
  const sections: NavSection[] = [
    {
      title: 'Overview',
      items: [
        { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/admin/merchants', label: 'Merchants', icon: Building2 },
        { to: '/admin/requests', label: 'Merchant Requests', icon: Inbox, badge: newRequests },
        { to: '/admin/transactions', label: 'Transactions', icon: ArrowLeftRight },
        { to: '/admin/collections', label: 'Payment Collections', icon: Network, badge: unmatched },
        { to: '/admin/payouts', label: 'Payouts', icon: Wallet, badge: pendingPayouts },
        { to: '/admin/reconciliation', label: 'Reconciliation', icon: Scale },
      ],
    },
    {
      title: 'Financials',
      items: [
        { to: '/admin/revenue', label: 'Revenue', icon: TrendingUp },
        { to: '/admin/expenses', label: 'Expenses', icon: Receipt },
        { to: '/admin/fees', label: 'Fees & Charges', icon: Percent },
        { to: '/admin/reports', label: 'Financial Reports', icon: BarChart3 },
      ],
    },
    {
      title: 'Platform',
      items: [
        { to: '/admin/channels', label: 'Payment Channels', icon: Radio },
        { to: '/admin/activity', label: 'Activity Logs', icon: Activity },
        { to: '/admin/settings', label: 'Settings', icon: Settings },
      ],
    },
  ]
  return <AppShell sections={sections} audience="admin" />
}

function MerchantLayout() {
  const { session, data, ready } = useStore()
  if (!session) return <Navigate to="/login" replace />
  if (!ready) return <Connecting />
  if (!session.merchantId) return <Navigate to={session.role === 'merchant' ? '/login' : '/admin'} replace />
  const merchant = data.merchants.find((m) => m.id === session.merchantId)
  if (!merchant) return <Navigate to="/login" replace />
  const sections: NavSection[] = [
    {
      title: 'Overview',
      items: [
        { to: '/merchant', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/merchant/transactions', label: 'Transactions', icon: ArrowLeftRight },
        { to: '/merchant/payment-links', label: 'Payment Links', icon: Link2 },
        { to: '/merchant/payouts', label: 'Payouts', icon: Banknote },
        { to: '/merchant/sms', label: 'SMS Alerts', icon: MessageSquare },
      ],
    },
    {
      title: 'Business',
      items: [
        { to: '/merchant/profile', label: 'Business Profile', icon: UserRound },
        { to: '/merchant/settlement', label: 'Settlement', icon: Landmark },
        { to: '/merchant/settings', label: 'Settings', icon: Settings },
      ],
    },
    {
      title: 'Support',
      items: [{ to: '/merchant/help', label: 'Help & Support', icon: HelpCircle }],
    },
  ]
  return (
    <AppShell
      sections={sections}
      audience={merchant.id}
      sidebarFooter={<MerchantSidebarCard merchant={merchant} />}
    />
  )
}

export default function App() {
  const { session } = useStore()
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="merchants" element={<MerchantsPage />} />
        <Route path="merchants/:id" element={<MerchantDetailPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="transactions" element={<AdminTransactionsPage />} />
        <Route path="collections" element={<CollectionsPage />} />
        <Route path="payouts" element={<AdminPayoutsPage />} />
        <Route path="reconciliation" element={<ReconciliationPage />} />
        <Route path="revenue" element={<RevenuePage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="fees" element={<FeesPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="channels" element={<ChannelsPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
      </Route>
      <Route path="/merchant" element={<MerchantLayout />}>
        <Route index element={<MerchantDashboard />} />
        <Route path="transactions" element={<MerchantTransactionsPage />} />
        <Route path="payment-links" element={<PaymentLinksPage />} />
        <Route path="payouts" element={<MerchantPayoutsPage />} />
        <Route path="sms" element={<SmsPage />} />
        <Route path="profile" element={<BusinessProfilePage />} />
        <Route path="settlement" element={<SettlementPage />} />
        <Route path="settings" element={<MerchantSettingsPage />} />
        <Route path="help" element={<HelpPage />} />
      </Route>
      <Route path="*" element={<Navigate to={!session ? '/login' : session.role === 'merchant' ? '/merchant' : '/admin'} replace />} />
    </Routes>
  )
}

