import { NavLink } from 'react-router-dom'
import { Building2, ClipboardList, Package } from 'lucide-react'

const links = [
  { to: '/suppliers', icon: Building2, label: '廠商管理' },
  { to: '/orders', icon: ClipboardList, label: '訂單管理' },
  { to: '/inventory', icon: Package, label: '倉儲同步' },
]

export default function NavBar() {
  return (
    <header className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-6">
      <div className="mr-4">
        <div className="text-sm font-bold text-gray-800">烏嘎嘎桌遊</div>
        <div className="text-xs text-gray-400">進貨管理</div>
      </div>
      <nav className="flex gap-1">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition ${
                isActive
                  ? 'bg-orange-50 text-orange-600 font-medium'
                  : 'text-gray-500 hover:bg-gray-50'
              }`
            }
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}
