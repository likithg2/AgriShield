import React, { useContext, useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Leaf, LayoutDashboard, Calculator, Building2, User, History, LogIn, Moon, Sun, Globe, TrendingUp, Trash2, Bell, AlertTriangle } from 'lucide-react';
import { ThemeContext } from '../context/ThemeContext';
import { LanguageContext } from '../context/LanguageContext';
import { AuthContext } from '../context/AuthContext';
import { NotificationContext } from '../context/NotificationContext';
import Button from './Button';
import { authAPI } from '../utils/api';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const TopBar = () => {
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const { language, changeLanguage, t } = useContext(LanguageContext);
  const { user, logout } = useContext(AuthContext);
  const { notifications, unreadCount, openNotification, markAllRead } = useContext(NotificationContext) || { notifications: [], unreadCount: 0 };
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef(null);

  // Close notifications when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const getLinks = () => {
    const links = [
      { path: '/dashboard', label: t('Home'), icon: LayoutDashboard },
    ];
    
    if (user.role === 'farmer') {
      links.push({ path: '/predict', label: t('Predict'), icon: Calculator });
    }
    
    if (user.role === 'warehouse_manager' || user.role === 'admin') {
      links.push({ path: '/warehouse', label: t('Warehouse'), icon: Building2 });
      links.push({ path: '/warehouse-logs', label: t('Logs'), icon: History });
    }
    
    if (user.role === 'farmer') {
      links.push({ path: '/history', label: t('History'), icon: History });
      links.push({ path: '/statistics', label: t('Statistics'), icon: TrendingUp });
    }
    
    return links;
  };

  return (
    <>
    <nav className="glass-panel mx-6 mt-4 px-6 py-4 flex items-center justify-between sticky top-4 z-50">
      <div className="flex items-center gap-2 text-primary font-bold text-xl">
        <Leaf size={24} />
        <span>AgriShield</span>
      </div>
      
      <div className="flex items-center gap-6">
        {getLinks().map((link) => (
          <NavLink 
            key={link.path}
            to={link.path}
            className={({ isActive }) => 
              `flex items-center gap-2 font-medium transition-colors ${isActive ? 'text-primary' : 'text-text-muted hover:text-primary'}`
            }
          >
            <link.icon size={18} />
            {link.label}
          </NavLink>
        ))}
      </div>
      
      <div className="flex items-center gap-4">
        {user && (
          <>
            <div className="flex items-center gap-2 bg-white/30 dark:bg-black/20 rounded-full px-2 py-1">
              <Globe size={16} className="text-text-muted" />
              <select 
                value={language || 'en'} 
                onChange={(e) => changeLanguage(e.target.value)}
                className="bg-transparent text-text-main dark:text-white font-medium focus:outline-none cursor-pointer appearance-none"
              >
                <option value="EN" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white">English</option>
                <option value="KN" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white">ಕನ್ನಡ</option>
                <option value="HI" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white">हिन्दी</option>
              </select>
            </div>
            
            <button onClick={toggleTheme} className="p-2 rounded-full bg-white/30 dark:bg-black/20 text-text-main hover:bg-primary/20 transition-colors">
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </>
        )}
        
        {user ? (
          <div className="flex items-center gap-4 ml-2">
            <div className="relative" ref={notifRef}>
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 rounded-full bg-white/30 dark:bg-black/20 text-text-main hover:bg-primary/20 transition-colors relative"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-danger text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-hidden flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-glass-border z-50">
                  <div className="p-3 border-b border-glass-border flex justify-between items-center bg-gray-50 dark:bg-gray-900 rounded-t-xl shrink-0">
                    <h3 className="font-bold text-sm text-gray-900 dark:text-white">Notifications</h3>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-xs text-primary hover:underline">Mark all read</button>
                    )}
                  </div>
                  <div className="divide-y divide-glass-border overflow-y-auto">
                    {notifications.length > 0 ? (
                      notifications.slice(0, 10).map(n => (
                        <div 
                          key={n.id}
                          className={`p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${!n.is_read ? 'bg-primary/5' : ''}`}
                          onClick={() => {
                            setShowNotifications(false);
                            openNotification(n);
                          }}
                        >
                          <div className="flex gap-2 items-start mb-1">
                            {n.type === 'dispatch_alert' ? <AlertTriangle size={14} className="text-warning mt-0.5 shrink-0" /> : <Bell size={14} className="text-primary mt-0.5 shrink-0" />}
                            <div className="flex-1">
                              <h4 className={`font-semibold text-sm leading-tight ${!n.is_read ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{n.title}</h4>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{n.message}</p>
                              <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 block">
                                {new Date(n.created_at).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-sm text-gray-500">No notifications</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col text-right ml-2">
              <span className="font-semibold text-sm">{user.full_name}</span>
              <span className="text-xs text-text-muted uppercase">{user.role}</span>
            </div>
            <Button variant="secondary" onClick={() => setShowLogoutConfirm(true)} className="!p-2 !rounded-full bg-white/40 hover:bg-red-100 text-danger border border-red-200" title="Logout">
              <LogIn size={18} />
            </Button>
          </div>
        ) : (
          <NavLink to="/login">
            <Button icon={LogIn}>Login</Button>
          </NavLink>
        )}
      </div>
    </nav>
      <AnimatePresence>
        {showLogoutConfirm && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-x-0 bottom-0 top-[88px] z-40 flex items-center justify-center bg-white/20 dark:bg-black/40 backdrop-blur-md p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.95, opacity: 0, y: 20 }} 
              transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
              className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-2xl p-6 rounded-3xl max-w-md w-full shadow-[0_8px_32px_rgba(0,0,0,0.1)] space-y-6 border border-white/60 dark:border-white/10"
            >
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-danger mb-2">
                <LogIn size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Confirm Logout</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Are you sure you want to log out of your account?
              </p>
            </div>
            <div className="flex gap-4 w-full">
              <Button type="button" variant="secondary" className="flex-1 justify-center" onClick={() => setShowLogoutConfirm(false)}>Cancel</Button>
              <Button type="button" className="flex-1 justify-center bg-danger hover:bg-red-600 text-white border-0" onClick={() => { setShowLogoutConfirm(false); logout(); toast.success("Successfully logged out."); }}>Yes, Logout</Button>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default TopBar;
