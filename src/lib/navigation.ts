import type { ComponentType } from 'react'
import { LayoutDashboard, FileText, Building2, ShieldAlert, CalendarClock, Settings } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/contracts', label: 'Договоры', icon: FileText },
  { to: '/app/counterparties', label: 'Контрагенты', icon: Building2 },
  { to: '/app/risks', label: 'Риски', icon: ShieldAlert },
  { to: '/app/deadlines', label: 'Календарь дедлайнов', icon: CalendarClock },
  { to: '/app/settings', label: 'Настройки', icon: Settings },
]
