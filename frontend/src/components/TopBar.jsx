import React, { useContext, useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Leaf, LayoutDashboard, Calculator, Building2, History, LogIn, Moon, Sun, Globe, TrendingUp, Menu, X, Edit2 } from 'lucide-react';
import EditProfileModal from './EditProfileModal';
import NotificationDropdown from './NotificationDropdown';
import { ThemeContext } from '../context/ThemeContext';
import { LanguageContext } from '../context/LanguageContext';
import { AuthContext } from '../context/AuthContext';
import Button from './Button';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const TopBar = () => {
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const { language, changeLanguage, t } = useContext(LanguageContext);
  const { user, logout } = useContext(AuthContext);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Close mobile menu whenever navigation occurs
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Hide full navbar on root / (https://agrishield-app.vercel.app/) and /login,
  // showing only the theme toggle icon as requested.
  if (location.pathname === '/' || location.pathname === '/login') {
    return (
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={toggleTheme}
          className="p-3 rounded-full bg-white/80 dark:bg-black/50 border border-gray-200 dark:border-white/10 shadow-lg text-text-main hover:bg-primary/20 hover:border-primary/40 transition-all backdrop-blur-md flex items-center justify-center cursor-pointer"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle theme"
        >
          {isDark ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-gray-700" />}
        </button>
      </div>
    );
  }

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
    <nav className="glass-panel glass-navbar mx-2 sm:mx-4 md:mx-6 mt-1.5 sm:mt-3 md:mt-4 px-3 sm:px-4 md:px-6 py-2 sm:py-3.5 sticky top-1.5 sm:top-4 z-50">
      <div className="flex items-center justify-between">
        {/* Brand Logo - Navigates to https://agrishield-app.vercel.app/ */}
        <a 
          href="https://agrishield-app.vercel.app/" 
          className="flex items-center gap-2 text-primary font-bold text-lg sm:text-xl tracking-tight hover:opacity-90 transition-opacity"
          title="AgriShield Home"
        >
          <Leaf size={22} className="shrink-0" />
          <span>AgriShield</span>
        </a>
        
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
          <NotificationDropdown />

          <button 
            type="button"
            onClick={() => setShowEditProfile(true)}
            className="flex flex-col text-right ml-1 cursor-pointer group text-left focus:outline-none"
            title="Edit Profile"
          >
            <span className="font-semibold text-sm truncate max-w-[140px] text-text-main group-hover:text-primary transition-colors flex items-center justify-end gap-1">
              {user.full_name}
              <Edit2 size={12} className="opacity-60 group-hover:opacity-100 transition-opacity text-primary shrink-0" />
            </span>
            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">{user.role}</span>
          </button>

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
          <NotificationDropdown isMobile />

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
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setShowEditProfile(true);
                }}
                className="flex items-center gap-2.5 hover:opacity-80 transition-opacity text-left cursor-pointer"
                title="Edit Profile"
              >
                <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
                  {user.full_name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div>
                  <div className="font-semibold text-sm leading-tight flex items-center gap-1">
                    <span>{user.full_name}</span>
                    <Edit2 size={11} className="text-primary" />
                  </div>
                  <div className="text-[10px] text-text-muted uppercase font-bold tracking-wider">{user.role}</div>
                </div>
              </button>
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
    {/* Edit Profile Modal */}
    <EditProfileModal isOpen={showEditProfile} onClose={() => setShowEditProfile(false)} />
    </>
  );
};

export default TopBar;
