'use client';

import { useSidebar } from '@/components/SidebarContext';
import dynamic from 'next/dynamic';

const KnowledgeGraph = dynamic(() => import('@/components/KnowledgeGraph'), { ssr: false });

export default function Home() {
  const { collapsed } = useSidebar();
  return (
    <div className={`absolute inset-y-0 right-0 transition-[left] duration-300 ${collapsed ? 'left-[60px]' : 'left-56'}`}>
      <div className="p-[5px] h-full box-border">
        <KnowledgeGraph />
      </div>
    </div>
  );
}
