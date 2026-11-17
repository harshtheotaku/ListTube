import React, { useMemo, useState } from 'react';
import {
  Bell,
  CheckCheck,
  ExternalLink,
  MessageSquare,
  Newspaper,
  RefreshCw,
  Sparkles,
  Tv,
  X,
} from 'lucide-react';
import {
  MalNotificationItem,
  MalNotificationKind,
  notificationsService,
  useNotifications,
} from '../services/notifications';
import { toast } from './Toast';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAnimeId: (animeId: string) => void;
  onOpenNewsTab: () => void;
}

type FilterKey = 'all' | MalNotificationKind;

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  onOpenAnimeId,
  onOpenNewsTab,
}) => {
  const { items, unreadCount, loading } = useNotifications();
  const [filter, setFilter] = useState<FilterKey>('all');

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((item) => item.kind === filter)),
    [items, filter]
  );

  if (!isOpen) return null;

  const handleItemClick = (item: MalNotificationItem) => {
    notificationsService.markRead(item.id);
    if (item.animeId) {
      onOpenAnimeId(item.animeId);
      onClose();
    } else if (item.externalUrl) {
      window.open(item.externalUrl, '_blank', 'noopener,noreferrer');
    } else {
      onOpenNewsTab();
      onClose();
    }
  };

  const kindIcon = (kind: MalNotificationKind) => {
    if (kind === 'episodes') return <Tv className="h-3.5 w-3.5 text-[#FF0000]" />;
    if (kind === 'sequels') return <Sparkles className="h-3.5 w-3.5 text-[#3EA6FF]" />;
    if (kind === 'news') return <Newspaper className="h-3.5 w-3.5 text-emerald-400" />;
    if (kind === 'social') return <MessageSquare className="h-3.5 w-3.5 text-violet-400" />;
    return <Bell className="h-3.5 w-3.5 text-amber-300" />;
  };

  return (
    <div
      className="fixed inset-0 z-[75] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-start sm:justify-end sm:p-4 sm:pt-16"
      role="dialog"
      aria-modal="true"
      aria-label="MyAnimeList Notifications"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/[0.12] bg-[#1C1C1C] text-white shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Bell className="h-4.5 w-4.5 text-[#FF0000]" />
            <h2 className="text-[15px] font-bold text-white">Notifications</h2>
            {unreadCount > 0 && (
              <span className="rounded-full bg-[#FF0000] px-2 py-0.5 text-[10px] font-extrabold text-white">
                {unreadCount}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  notificationsService.markAllRead();
                  toast('All notifications marked as read');
                }}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-[#3EA6FF] transition hover:bg-white/10"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark read
              </button>
            )}
            <button
              type="button"
              onClick={() => void notificationsService.refresh(true)}
              aria-label="Refresh notifications"
              className="rounded-full p-1.5 text-[#AAAAAA] transition hover:bg-white/10 hover:text-white"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              className="rounded-full p-1.5 text-[#AAAAAA] transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* MAL & Social Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-white/[0.08] bg-[#161616] px-4 py-2.5 no-scrollbar">
          {([
            { id: 'all', label: 'All' },
            { id: 'social', label: 'Community' },
            { id: 'episodes', label: 'Airing Episodes' },
            { id: 'sequels', label: 'Sequels' },
            { id: 'news', label: 'MAL News' },
          ] as { id: FilterKey; label: string }[]).map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setFilter(chip.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-[11.5px] font-semibold transition ${
                filter === chip.id
                  ? 'bg-[#F1F1F1] text-[#0F0F0F]'
                  : 'bg-[#272727] text-[#CCCCCC] hover:bg-[#353535]'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Notification Feed */}
        <div className="flex-1 divide-y divide-white/[0.06] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-[#AAAAAA]">
              <Bell className="mx-auto mb-2.5 h-8 w-8 opacity-40" />
              <p className="text-[13px] font-semibold text-white">No notifications yet</p>
              <p className="mt-1 text-[11.5px]">
                Add airing shows to get episode countdowns and sequel alerts.
              </p>
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleItemClick(item)}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/[0.05] ${
                  !item.read ? 'bg-white/[0.03]' : ''
                }`}
              >
                <div className="relative mt-0.5 shrink-0">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt=""
                      className="h-14 w-11 rounded-lg border border-white/10 object-cover bg-black"
                    />
                  ) : (
                    <div className="flex h-14 w-11 items-center justify-center rounded-lg bg-[#272727]">
                      {kindIcon(item.kind)}
                    </div>
                  )}
                  <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-[#1C1C1C] bg-[#242424]">
                    {kindIcon(item.kind)}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`line-clamp-2 text-[12.5px] leading-snug ${
                        !item.read ? 'font-bold text-white' : 'font-medium text-neutral-300'
                      }`}
                    >
                      {item.title}
                    </p>
                    {!item.read && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#3EA6FF]" />
                    )}
                  </div>
                  <p className="mt-1 line-clamp-1 text-[11px] text-[#AAAAAA]">{item.subtitle}</p>
                  <div className="mt-1 flex items-center gap-2 text-[10px]">
                    <span className="rounded bg-white/[0.08] px-1.5 py-0.5 font-semibold text-neutral-300">
                      {item.timeLabel}
                    </span>
                    {item.externalUrl && (
                      <span className="inline-flex items-center gap-0.5 text-[#3EA6FF]">
                        Open <ExternalLink className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
