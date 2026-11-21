import React, { useContext, useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, AlertTriangle, History, Check } from 'lucide-react';
import { NotificationContext } from '../context/NotificationContext';

const NotificationDropdown = ({ isMobile = false }) => {
  const { notifications, unreadCount, openNotification, markAllRead, setShowNotificationHistory } =
    useContext(NotificationContext) || { notifications: [], unreadCount: 0 };
  const unreadNotifications = (notifications || []).filter((n) => !n.is_read);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    setShowNotifications(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const badgeText = isMobile
    ? unreadCount > 9 ? '9+' : unreadCount
    : unreadCount > 99 ? '99+' : unreadCount;

  const btnClass = isMobile
    ? 'p-2 rounded-full bg-white/60 dark:bg-black/30 border border-gray-200 dark:border-white/10 shadow-sm text-text-main relative cursor-pointer'
    : 'p-2 rounded-full bg-white/50 dark:bg-black/30 border border-white/40 dark:border-white/10 shadow-sm text-text-main hover:bg-primary/20 transition-colors relative cursor-pointer';

  const menuPosClass = isMobile
    ? 'fixed inset-x-3 sm:absolute sm:inset-x-auto sm:right-0 top-16 sm:top-auto sm:mt-2 w-auto sm:w-80'
    : 'absolute right-0 mt-2 w-80';

  return (
    <div className="relative" ref={notifRef}>
      <button
        type="button"
        onClick={() => setShowNotifications(!showNotifications)}
        className={btnClass}
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-danger text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full">
            {badgeText}
          </span>
        )}
      </button>

      {showNotifications && (
        <div className={`${menuPosClass} max-h-96 overflow-hidden flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-glass-border z-50`}>
          <div className="p-3 border-b border-glass-border flex justify-between items-center bg-gray-50 dark:bg-gray-900 rounded-t-xl shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white">Unread Notifications</h3>
              {unreadCount > 0 && (
                <span className="bg-primary/20 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    markAllRead();
                  }}
                  className="text-xs text-primary hover:underline font-semibold cursor-pointer"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNotifications(false);
                  setShowNotificationHistory(true);
                }}
                className="p-1 rounded-full text-text-muted hover:text-primary transition-colors cursor-pointer"
                title="Notification History"
                aria-label="Notification History"
              >
                <History size={15} />
              </button>
            </div>
          </div>
          <div className="divide-y divide-glass-border overflow-y-auto max-h-64">
            {unreadNotifications.length > 0 ? (
              unreadNotifications.map((n) => (
                <button
                  type="button"
                  key={n.id}
                  className="w-full text-left p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 bg-primary/5 transition-colors block"
                  onClick={() => {
                    setShowNotifications(false);
                    openNotification(n);
                  }}
                >
                  <div className="flex gap-2 items-start mb-1">
                    {n.type === 'dispatch_alert' ? (
                      <AlertTriangle size={14} className="text-warning mt-0.5 shrink-0" />
                    ) : (
                      <Bell size={14} className="text-primary mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1">
                      <h4 className="font-semibold text-sm leading-tight text-gray-900 dark:text-white">{n.title}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{n.message}</p>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 block">
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-6 text-center text-sm text-text-muted flex flex-col items-center justify-center gap-2">
                <div className="w-8 h-8 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center">
                  <Check size={18} />
                </div>
                <span>All caught up! No unread notifications.</span>
              </div>
            )}
          </div>
          <div className="p-2 border-t border-glass-border bg-gray-50 dark:bg-gray-900 rounded-b-xl shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowNotifications(false);
                setShowNotificationHistory(true);
              }}
              className="w-full py-1.5 px-3 text-xs font-semibold text-primary hover:bg-primary/10 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <History size={14} />
              <span>Notification History ({notifications?.length || 0})</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationDropdown;
