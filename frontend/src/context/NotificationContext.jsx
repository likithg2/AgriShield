import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { notificationsAPI } from '../utils/api';
import { AuthContext } from './AuthContext';
import toast from 'react-hot-toast';
import { AlertTriangle, Bell, X, History, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const { user } = useContext(AuthContext);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Keep track of IDs we've already toasted in this session
  const notifiedIds = useRef(new Set());
  // Ref to know if it's the first load (to avoid toasting all old unread notifs)
  const isFirstLoad = useRef(true);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const res = await notificationsAPI.list();
      const newNotifs = res.data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      setNotifications(newNotifs);
      setUnreadCount(newNotifs.filter(n => !n.is_read).length);
      
      if (!isFirstLoad.current) {
        newNotifs.forEach(n => {
          if (!n.is_read && !notifiedIds.current.has(n.id)) {
            toast.custom((t) => (
              <motion.div
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.6}
                onDragEnd={(_, info) => {
                  if (Math.abs(info.offset.x) > 60 || Math.abs(info.velocity.x) > 200) {
                    toast.dismiss(t.id);
                  }
                }}
                className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-white/95 dark:bg-gray-800/95 backdrop-blur-md shadow-2xl rounded-2xl pointer-events-auto flex border border-primary/20 dark:border-white/10 overflow-hidden cursor-pointer touch-none select-none`}
                onClick={() => {
                  openNotification(n);
                  toast.dismiss(t.id);
                }}
              >
                <div className="flex-1 w-0 p-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0 pt-0.5">
                      {n.type === 'dispatch_alert' ? <AlertTriangle className="h-8 w-8 text-warning" /> : <Bell className="h-8 w-8 text-primary" />}
                    </div>
                    <div className="ml-3 flex-1 min-w-0 pr-2">
                      <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                        {n.title}
                      </p>
                      <p className="mt-1 text-xs text-gray-600 dark:text-gray-300 line-clamp-2">
                        {n.message}
                      </p>
                      <span className="text-[10px] text-text-muted mt-1 block">
                        Swipe or tap to open • {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-start p-3 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.dismiss(t.id);
                    }}
                    className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                    aria-label="Dismiss notification"
                  >
                    <X size={16} />
                  </button>
                </div>
              </motion.div>
            ), { duration: 6000 });
            notifiedIds.current.add(n.id);
          }
        });
      } else {
        // Just populate the set on first load without toasting
        newNotifs.forEach(n => {
          if (!n.is_read) {
            notifiedIds.current.add(n.id);
          }
        });
        isFirstLoad.current = false;
      }
    } catch (err) {
      console.error("Failed to fetch notifications", err);
    }
  };

  useEffect(() => {
    if (user) {
      isFirstLoad.current = true;
      notifiedIds.current.clear();
      void fetchNotifications();
      const interval = setInterval(() => {
        void fetchNotifications();
      }, 10000); // 10s poll
      return () => clearInterval(interval);
    } else {
      setNotifications([]);
      setUnreadCount(0);
      notifiedIds.current.clear();
      isFirstLoad.current = true;
    }
  }, [user]);

  const [selectedNotification, setSelectedNotification] = useState(null);
  const [showNotificationHistory, setShowNotificationHistory] = useState(false);

  const markAsRead = async (id) => {
    try {
      await notificationsAPI.markAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark as read", err);
    }
  };

  const markAllRead = async () => {
    try {
      await notificationsAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
      toast.success("All notifications marked as read");
    } catch (err) {
      console.error("Failed to mark all as read", err);
      toast.error("Failed to mark all as read");
    }
  };

  const openNotification = (notif) => {
    if (!notif.is_read) {
      void markAsRead(notif.id);
    }
    setSelectedNotification(notif);
  };

  return (
    <NotificationContext.Provider value={{ 
      notifications, 
      unreadCount, 
      markAsRead, 
      markAllRead, 
      fetchNotifications, 
      openNotification,
      showNotificationHistory,
      setShowNotificationHistory
    }}>
      {children}
      
      {/* GLOBAL NOTIFICATION DETAILS MODAL */}
      <AnimatePresence>
        {selectedNotification && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-x-0 bottom-0 top-[88px] z-40 flex items-center justify-center bg-white/20 dark:bg-black/40 backdrop-blur-md p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.95, opacity: 0, y: 20 }} 
              transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
              className="w-full max-w-lg flex flex-col p-0 border border-white/60 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.1)] overflow-hidden rounded-3xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-2xl"
            >
            <div className="p-4 border-b border-white/30 dark:border-white/10 flex justify-between items-center bg-white/40 dark:bg-black/20">
              <h2 className="text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                {selectedNotification.type === 'dispatch_alert' ? <AlertTriangle size={20} className="text-warning" /> : <Bell size={20} className="text-primary" />}
                {selectedNotification.title}
              </h2>
              <button 
                onClick={() => setSelectedNotification(null)}
                className="p-1 rounded-full hover:bg-white/10 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <span className="text-xs text-gray-500 dark:text-gray-400 block mb-4 border-b border-gray-200 dark:border-white/5 pb-2">
                Received: {new Date(selectedNotification.created_at).toLocaleString()}
              </span>
              <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                {selectedNotification.message}
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-black/20 flex justify-end">
              <button 
                onClick={() => setSelectedNotification(null)} 
                className="bg-primary text-white hover:bg-primary-dark font-medium py-2 px-6 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* GLOBAL NOTIFICATION HISTORY MODAL */}
      <AnimatePresence>
        {showNotificationHistory && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.95, opacity: 0, y: 20 }} 
              transition={{ type: "spring", duration: 0.4 }}
              className="bg-white dark:bg-gray-800 p-6 rounded-3xl max-w-2xl w-full shadow-2xl space-y-4 border border-glass-border flex flex-col max-h-[85vh]"
            >
              <div className="flex justify-between items-center pb-4 border-b border-glass-border shrink-0">
                <div className="flex items-center gap-2">
                  <History className="text-primary" size={22} />
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Notification History</h3>
                  <span className="text-xs text-text-muted bg-gray-100 dark:bg-white/10 px-2.5 py-0.5 rounded-full font-medium">
                    {notifications.length} total
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="text-xs text-primary hover:underline font-semibold px-2 py-1"
                    >
                      Mark all read
                    </button>
                  )}
                  <button 
                    type="button"
                    onClick={() => setShowNotificationHistory(false)} 
                    className="p-1 rounded-full text-text-muted hover:text-danger hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 pr-1 space-y-2">
                {notifications.length > 0 ? (
                  notifications.map(notif => (
                    <button 
                      type="button"
                      key={notif.id} 
                      className={`w-full text-left p-4 rounded-xl border border-glass-border/60 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer transition-colors block ${!notif.is_read ? 'bg-primary/10 border-primary/30' : 'bg-white/40 dark:bg-black/20'}`}
                      onClick={() => { setShowNotificationHistory(false); openNotification(notif); }}
                    >
                      <div className="flex justify-between items-start gap-2 mb-1">
                        <h4 className="font-bold flex items-center gap-2 text-sm text-gray-900 dark:text-white">
                          {notif.type === 'dispatch_alert' ? <AlertTriangle size={15} className="text-warning shrink-0" /> : <Bell size={15} className="text-primary shrink-0" />}
                          <span>{notif.title}</span>
                          {!notif.is_read && (
                            <span className="w-2 h-2 rounded-full bg-primary inline-block shrink-0"></span>
                          )}
                        </h4>
                        <span className="text-[11px] text-text-muted shrink-0">
                          {new Date(notif.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted line-clamp-2 mt-1">{notif.message}</p>
                    </button>
                  ))
                ) : (
                  <div className="text-center p-8 text-text-muted">
                    No notification history found.
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-glass-border flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setShowNotificationHistory(false)}
                  className="px-5 py-2 text-sm font-medium bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 rounded-xl transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </NotificationContext.Provider>
  );
};
