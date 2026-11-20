import React, { useContext, useState, useRef, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Leaf, LayoutDashboard, Calculator, Building2, User, History, LogIn, Moon, Sun, Globe, TrendingUp, Trash2, Bell, AlertTriangle, Menu, X } from 'lucide-react';
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const notifRef = useRef(null);
  const location = useLocation();

  // Close mobile menu whenever navigation occurs
  useEffect(() => {
    setMobileMenuOpen(false);
    setShowNotifications(false);
  }, [location.pathname]);

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

  const navLinks = getLinks();

  return (
    <>
    <nav className="glass-panel glass-navbar mx-3 sm:mx-4 md:mx-6 mt-2 sm:mt-3 md:mt-4 px-3 sm:px-4 md:px-6 py-2.5 sm:py-3.5 sticky top-2 sm:top-4 z-50">
      <div className="flex items-center justify-between">
        {/* Brand Logo */}
        <NavLink to="/dashboard" className="flex items-center gap-2 text-primary font-bold text-lg sm:text-xl tracking-tight">
          <Leaf size={22} className="shrink-0" />
          <span>AgriShield</span>
        </NavLink>
        
        {/* Desktop Navigation Links */}
        <div className="hidden lg:flex items-center gap-5 xl:gap-6">
          {navLinks.map((link) => (
            <NavLink 
              key={link.path}
              to={link.path}
              className={({ isActive }) => 
                `flex items-center gap-2 text-sm font-medium transition-colors ${isActive ? 'text-primary' : 'text-text-muted hover:text-primary'}`
              }
            >
              <link.icon size={17} />
              {link.label}
            </NavLink>
          ))}
        </div>
        
        {/* Desktop Actions */}
        <div className="hidden lg:flex items-center gap-3 xl:gap-4">
          <div className="flex items-center gap-2 bg-white/70 dark:bg-black/40 border border-gray-200 dark:border-white/10 shadow-sm rounded-full px-2.5 py-1">
            <Globe size={15} className="text-gray-600 dark:text-gray-300" />
            <select 
              value={language || 'en'} 
              onChange={(e) => changeLanguage(e.target.value)}
              className="bg-transparent text-gray-900 dark:text-white font-semibold text-xs focus:outline-none cursor-pointer"
            >
              <option value="EN" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white">English</option>
              <option value="KN" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white">ಕನ್ನಡ</option>
              <option value="HI" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white">हिन्दी</option>
            </select>
          </div>
          
          <button 
            onClick={toggleTheme} 
            className="p-2 rounded-full bg-white/50 dark:bg-black/30 border border-white/40 dark:border-white/10 shadow-sm text-text-main hover:bg-primary/20 transition-colors"
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          
          {/* Notifications Popover */}
          <div className="relative" ref={notifRef}>
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 rounded-full bg-white/50 dark:bg-black/30 border border-white/40 dark:border-white/10 shadow-sm text-text-main hover:bg-primary/20 transition-colors relative"
              title="Notifications"
            >
              <Bell size={17} />
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
                      <button 
                        type="button"
                        key={n.id}
                        className={`w-full text-left p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors block ${!n.is_read ? 'bg-primary/5' : ''}`}
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
                      </button>
                    ))
                  ) : (
                    <div className="p-4 text-center text-sm text-gray-500">No notifications</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col text-right ml-1">
            <span className="font-semibold text-sm truncate max-w-[140px]">{user.full_name}</span>
            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">{user.role}</span>
          </div>

          <Button 
            variant="secondary" 
            onClick={() => setShowLogoutConfirm(true)} 
            className="!p-2 !rounded-full bg-white/50 dark:bg-black/30 hover:bg-red-100 dark:hover:bg-red-900/40 text-danger border border-red-200/80 dark:border-red-900/40 shadow-sm" 
            title="Logout"
          >
            <LogIn size={17} />
          </Button>
        </div>

        {/* Mobile Header Controls (< lg) */}
        <div className="flex lg:hidden items-center gap-1.5 sm:gap-2">
          {/* Notifications on Mobile */}
          <div className="relative" ref={notifRef}>
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 rounded-full bg-white/60 dark:bg-black/30 border border-gray-200 dark:border-white/10 shadow-sm text-text-main relative"
              title="Notifications"
            >
              <Bell size={17} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-danger text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="fixed inset-x-3 sm:absolute sm:inset-x-auto sm:right-0 top-16 sm:top-auto sm:mt-2 w-auto sm:w-80 max-h-96 overflow-hidden flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-glass-border z-50">
                <div className="p-3 border-b border-glass-border flex justify-between items-center bg-gray-50 dark:bg-gray-900 rounded-t-xl shrink-0">
                  <h3 className="font-bold text-sm text-gray-900 dark:text-white">Notifications</h3>
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="text-xs text-primary hover:underline">Mark all read</button>
                  )}
                </div>
                <div className="divide-y divide-glass-border overflow-y-auto max-h-80">
                  {notifications.length > 0 ? (
                    notifications.slice(0, 10).map(n => (
                      <button 
                        type="button"
                        key={n.id}
                        className={`w-full text-left p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors block ${!n.is_read ? 'bg-primary/5' : ''}`}
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
                      </button>
                    ))
                  ) : (
                    <div className="p-4 text-center text-sm text-gray-500">No notifications</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Theme Toggle Mobile */}
          <button 
            onClick={toggleTheme} 
            className="p-2 rounded-full bg-white/60 dark:bg-black/30 border border-gray-200 dark:border-white/10 shadow-sm text-text-main"
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          {/* Mobile Hamburger Button */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-full bg-white/60 dark:bg-black/30 border border-gray-200 dark:border-white/10 shadow-sm text-text-main hover:bg-primary/10 transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X size={20} className="text-primary" /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Collapsible Navigation Menu Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="lg:hidden overflow-hidden border-t border-glass-border/60 mt-3 pt-3"
          >
            {/* User Profile Card Mobile */}
            <div className="p-3 mb-3 rounded-xl bg-white/40 dark:bg-black/30 border border-glass-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
                  {user.full_name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div>
                  <div className="font-semibold text-sm leading-tight">{user.full_name}</div>
                  <div className="text-[10px] text-text-muted uppercase font-bold tracking-wider">{user.role}</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 bg-white/70 dark:bg-black/50 border border-gray-200 dark:border-white/10 rounded-lg px-2 py-1">
                <Globe size={13} className="text-gray-500" />
                <select 
                  value={language || 'en'} 
                  onChange={(e) => changeLanguage(e.target.value)}
                  className="bg-transparent text-gray-900 dark:text-white font-semibold text-[11px] focus:outline-none cursor-pointer"
                >
                  <option value="EN" className="bg-white text-gray-900">EN</option>
                  <option value="KN" className="bg-white text-gray-900">ಕನ್ನಡ</option>
                  <option value="HI" className="bg-white text-gray-900">हिन्दी</option>
                </select>
              </div>
            </div>

            {/* Mobile Nav Links */}
            <div className="flex flex-col gap-1.5 mb-3">
              {navLinks.map((link) => (
                <NavLink 
                  key={link.path}
                  to={link.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) => 
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-colors ${
                      isActive 
                        ? 'bg-primary text-white shadow-md' 
                        : 'text-text-main hover:bg-white/40 dark:hover:bg-white/5'
                    }`
                  }
                >
                  <link.icon size={18} />
                  <span>{link.label}</span>
                </NavLink>
              ))}
            </div>

            {/* Mobile Logout Button */}
            <div className="pt-2 border-t border-glass-border/40">
              <button 
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setShowLogoutConfirm(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-danger bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors"
              >
                <LogIn size={16} />
                <span>Log Out</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>

    {/* Logout Confirmation Modal */}
    <AnimatePresence>
      {showLogoutConfirm && (
        <motion.div 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4"
        >
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: 20 }} 
            animate={{ scale: 1, opacity: 1, y: 0 }} 
            exit={{ scale: 0.95, opacity: 0, y: 20 }} 
            transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
            className="bg-white dark:bg-gray-900 p-6 rounded-3xl max-w-sm sm:max-w-md w-full shadow-2xl space-y-5 border border-white/60 dark:border-white/10"
          >
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-danger mb-1">
              <LogIn size={28} />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Confirm Logout</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Are you sure you want to log out of your account?
            </p>
          </div>
          <div className="flex gap-3 w-full">
            <Button type="button" variant="secondary" className="flex-1 justify-center py-2.5 text-sm" onClick={() => setShowLogoutConfirm(false)}>Cancel</Button>
            <Button type="button" className="flex-1 justify-center py-2.5 text-sm bg-danger hover:bg-red-600 text-white border-0" onClick={() => { setShowLogoutConfirm(false); logout(); toast.success("Successfully logged out."); }}>Yes, Logout</Button>
          </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
};

export default TopBar;
