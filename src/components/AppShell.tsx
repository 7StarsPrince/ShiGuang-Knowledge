'use client';

import Sidebar from './Sidebar';
import { useSidebar } from './SidebarContext';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { collapsed, toggle } = useSidebar();

  return (
    <>
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <main className={`flex-1 overflow-hidden min-h-screen transition-[margin] duration-300 ${collapsed ? 'ml-[60px]' : 'ml-56'}`}>
        {children}
      </main>
    </>
  );
}
