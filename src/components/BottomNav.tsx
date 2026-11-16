import React from 'react';
import { Calendar, Compass, Home, Tv, User } from 'lucide-react';
import { AppTab } from './Sidebar';

interface BottomNavProps {
  active: AppTab;
  onNavigate: (tab: AppTab) => void;
}

const ITEMS: { id: AppTab; label: string; icon: React.ElementType }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'explore', label: 'Explore', icon: Compass },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'list', label: 'Subs', icon: Tv },
  { id: 'you', label: 'You', icon: User },
];

export const BottomNav: React.FC<BottomNavProps> = ({ active, onNavigate }) => (
  <nav className="safe-pb fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#0F0F0F]/95 backdrop-blur-xl lg:hidden">
    <div className="mx-auto flex max-w-md items-stretch justify-around">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-semibold transition ${
              isActive ? 'text-white' : 'text-[#AAAAAA]'
            }`}
          >
            <Icon className={`h-5 w-5 ${isActive ? 'text-[#FF0000]' : ''}`} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  </nav>
);
