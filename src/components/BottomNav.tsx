import React from 'react';
import { Compass, Home, MessageSquareHeart, Tv } from 'lucide-react';
import { useSettings } from '../services/settings';
import { useChromeVisible } from '../services/scrollChrome';
import { useProfile } from '../services/profile';
import { useCloudSync } from '../services/cloudSync';
import { AppTab } from './Sidebar';

interface BottomNavProps {
  active: AppTab;
  onNavigate: (tab: AppTab) => void;
}

const ITEMS: { id: AppTab; label: string; icon?: React.ElementType }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'explore', label: 'Explore', icon: Compass },
  { id: 'feed', label: 'Feed', icon: MessageSquareHeart },
  { id: 'list', label: 'Subs', icon: Tv },
  { id: 'you', label: 'You' },
];

export const BottomNav: React.FC<BottomNavProps> = ({ active, onNavigate }) => {
  const settings = useSettings();
  const chromeVisible = useChromeVisible();
  const profile = useProfile();
  const cloud = useCloudSync();

  const hideClass = chromeVisible
    ? 'translate-y-0 opacity-100'
    : 'translate-y-[145%] opacity-0 pointer-events-none';

  const renderIcon = (item: (typeof ITEMS)[number], isActive: boolean) => {
    if (item.id === 'you' || !item.icon) {
      return (
        <span className="relative inline-flex">
          <img
            src={profile.avatarUrl}
            alt="You"
            className={`h-[20px] w-[20px] rounded-full object-cover transition-transform duration-200 ${
              isActive
                ? 'scale-110 ring-2 ring-white'
                : 'ring-1 ring-white/25'
            }`}
          />
          {cloud.isLinked && (
            <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[#0F0F0F] bg-emerald-400" />
          )}
        </span>
      );
    }
    const Icon = item.icon;
    return (
      <Icon
        className={`h-[19px] w-[19px] transition-transform duration-200 ${
          isActive ? 'scale-110' : 'scale-100'
        }`}
        style={isActive ? { color: 'var(--lt-accent)' } : undefined}
      />
    );
  };

  if (settings.liquidGlass) {
    return (
      <nav
        aria-label="Mobile Navigation"
        style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom, 0px))' }}
        className={`fixed inset-x-3 bottom-2.5 z-40 mx-auto max-w-[440px] rounded-[30px] border border-white/[0.18] px-1.5 pt-1.5 liquid-glass transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:hidden ${hideClass}`}
      >
        <div className="flex items-stretch justify-around gap-1">
          {ITEMS.map((item) => {
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
                {renderIcon(item, isActive)}
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
      className={`safe-pb fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#0F0F0F]/95 backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:hidden ${hideClass}`}
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {ITEMS.map((item) => {
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
              {renderIcon(item, isActive)}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
