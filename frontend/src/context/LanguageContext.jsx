import React, { createContext, useState } from 'react';

export const LanguageContext = createContext();

const ALLOWED_LANGUAGES = ['EN', 'KN', 'HI'];

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => {
    const saved = localStorage.getItem('language');
    return saved && ALLOWED_LANGUAGES.includes(saved.toUpperCase()) ? saved.toUpperCase() : 'EN';
  });

  const changeLanguage = (lang) => {
    const upper = String(lang || '').toUpperCase();
    const safeLang = ALLOWED_LANGUAGES.includes(upper) ? upper : 'EN';
    setLanguage(safeLang);
    localStorage.setItem('language', safeLang);
    document.cookie = `googtrans=/en/${safeLang.toLowerCase()}; path=/`;
    document.cookie = `googtrans=/en/${safeLang.toLowerCase()}; domain=localhost; path=/`;
    window.location.reload();
  };

  // We don't need the mock translation anymore, but keep the function signature so app doesn't break
  const t = (text) => {
    if (language === 'KN') {
      // Mock translation for demo purposes
      const dict = {
        'Login': 'ಲಾಗಿನ್',
        'Home': 'ಮುಖಪುಟ',
        'Predict': 'ಮುನ್ಸೂಚನೆ',
        'Warehouse': 'ಗೋದಾಮು',
        'Farmer': 'ರೈತ',
        'History': 'ಇತಿಹಾಸ'
      };
      return dict[text] || text;
    }
    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};
