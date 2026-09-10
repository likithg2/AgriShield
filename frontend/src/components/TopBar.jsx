import React, { useContext, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Leaf, LayoutDashboard, Calculator, Building2, User, History, LogIn, Moon, Sun, Globe, TrendingUp, Trash2 } from 'lucide-react';
import { ThemeContext } from '../context/ThemeContext';
import { LanguageContext } from '../context/LanguageContext';
import { AuthContext } from '../context/AuthContext';
import Button from './Button';
import { authAPI } from '../utils/api';
import toast from 'react-hot-toast';

const TopBar = () => {
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const { language, changeLanguage, t } = useContext(LanguageContext);
  const { user, logout } = useContext(AuthContext);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

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
            <div className="flex flex-col text-right">
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
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-6 border border-glass-border">
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
          </div>
        </div>
      )}
    </>
  );
};

export default TopBar;
