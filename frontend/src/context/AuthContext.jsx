import React, { createContext, useState, useEffect } from 'react';
import { authAPI } from '../utils/api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(() => {
    return !localStorage.getItem('user') && !!localStorage.getItem('auth_token');
  });
  const [selectedAdminWarehouseId, setSelectedAdminWarehouseId] = useState(() => {
    const saved = localStorage.getItem('selectedAdminWarehouseId');
    return saved ? Number.parseInt(saved, 10) : null;
  });

  const setAdminWarehouse = (id) => {
    const safeId = id ? Number.parseInt(id, 10) : null;
    setSelectedAdminWarehouseId(safeId);
    if (safeId) {
      localStorage.setItem('selectedAdminWarehouseId', String(safeId));
    } else {
      localStorage.removeItem('selectedAdminWarehouseId');
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('auth_token');
      if (token) {
        try {
          const res = await authAPI.getProfile();
          setUser(res.data);
          localStorage.setItem('user', JSON.stringify(res.data));
        } catch (err) {
          console.error("Auth init failed", err);
          logout();
        }
      } else {
        setUser(null);
        localStorage.removeItem('user');
      }
      setLoading(false);
    };
    void initAuth();
  }, []);

  const login = (token, userData) => {
    if (typeof token === 'string' && token.trim()) {
      localStorage.setItem('auth_token', token.trim());
    }
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
    }
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, selectedAdminWarehouseId, setAdminWarehouse }}>
      {children}
    </AuthContext.Provider>
  );
};
