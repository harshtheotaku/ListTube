import React from 'react';
import { Compass, Home, MessageSquareHeart, Tv, User } from 'lucide-react';
import { useSettings } from '../services/settings';
import { AppTab } from './Sidebar';

interface BottomNavProps {
  active: AppTab;
  onNavigate: (tab: AppTab) => void;
}

const ITEMS: { id: AppTab; label: string; icon: React.ElementType }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'explore', label: 'Explore', icon: Compass },
  { id: 'feed', label: 'Feed', icon: MessageSquareHeart },
  { id: 'list', label: 'Subs', icon: Tv },
  { id: 'you', label: 'You', icon: User },
];

export const BottomNav: React.FC<BottomNavProps> = ({ active, onNavigate }) => {
  const settings = useSettings();

  if (settings.liquidGlass) {
    return (
      <nav
        aria-label="Mobile Navigation"
        style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom, 0px))' }}
        className="fixed inset-x-3 bottom-2.5 z-40 mx-auto max-w-[440px] rounded-[30px] border border-white/[0.18] px-1.5 pt-1.5 liquid-glass lg:hidden"
      >
        <div className="flex items-stretch justify-around gap-1">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`lt-press flex flex-1 flex-col items-center gap-0.5 rounded-[22px] py-1.5 text-[10px] font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-white/[0.15] text-white shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.28)]'
                    : 'text-[#A6A6AE] hover:text-white'
                }`}
              >
                <Icon
                  className={`h-[19px] w-[19px] transition-transform duration-200 ${
                    isActive ? 'scale-110' : 'scale-100'
                  }`}
                  style={isActive ? { color: 'var(--lt-accent)' } : undefined}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <nav
      aria-label="Mobile Navigation"
      className="safe-pb fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#0F0F0F]/95 backdrop-blur-xl lg:hidden"
    >
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
              <Icon
                className="h-5 w-5"
                style={isActive ? { color: 'var(--lt-accent)' } : undefined}
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
