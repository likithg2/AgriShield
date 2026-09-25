import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { notificationsAPI } from '../utils/api';
import { AuthContext } from './AuthContext';
import toast from 'react-hot-toast';
import { AlertTriangle, Bell } from 'lucide-react';
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
              <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-white dark:bg-gray-800 shadow-lg rounded-xl pointer-events-auto flex ring-1 ring-black ring-opacity-5`}>
                <div className="flex-1 w-0 p-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0 pt-0.5">
                      {n.type === 'dispatch_alert' ? <AlertTriangle className="h-10 w-10 text-warning" /> : <Bell className="h-10 w-10 text-primary" />}
                    </div>
                    <div className="ml-3 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {n.title}
                      </p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {n.message.substring(0, 50)}{n.message.length > 50 ? '...' : ''}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ), { duration: 5000 });
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
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 10000); // 10s poll
      return () => clearInterval(interval);
    } else {
      setNotifications([]);
      setUnreadCount(0);
      notifiedIds.current.clear();
      isFirstLoad.current = true;
    }
  }, [user]);

  const [selectedNotification, setSelectedNotification] = useState(null);

  const markAsRead = async (id) => {
    try {
      await notificationsAPI.markAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark as read", err);
    }
  };

  const openNotification = (notif) => {
    if (!notif.is_read) {
      markAsRead(notif.id);
    }
    setSelectedNotification(notif);
  };

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, fetchNotifications, openNotification }}>
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
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
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
    </NotificationContext.Provider>
  );
};
