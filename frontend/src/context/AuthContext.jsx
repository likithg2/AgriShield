import React, { createContext, useState, useEffect } from 'react';
import { authAPI } from '../utils/api';

export const AuthContext = createContext();

const sanitizeUserData = (data) => {
  if (!data || typeof data !== 'object') return null;
  return {
    id: typeof data.id === 'number' ? data.id : Number.parseInt(data.id, 10) || 0,
    full_name: typeof data.full_name === 'string' ? data.full_name.slice(0, 100) : '',
    phone: typeof data.phone === 'string' ? data.phone.slice(0, 20) : '',
    email: typeof data.email === 'string' ? data.email.slice(0, 100) : '',
    role: typeof data.role === 'string' ? data.role.slice(0, 50) : '',
    district: typeof data.district === 'string' ? data.district.slice(0, 100) : null,
    managed_warehouse_id: data.managed_warehouse_id ? Number.parseInt(data.managed_warehouse_id, 10) : null,
  };
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
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
          const storedUser = localStorage.getItem('user');
          if (storedUser) {
            setUser(sanitizeUserData(JSON.parse(storedUser)));
          } else {
            const res = await authAPI.getProfile();
            const cleanUser = sanitizeUserData(res.data);
            if (cleanUser) {
              setUser(cleanUser);
              localStorage.setItem('user', JSON.stringify(cleanUser));
            }
          }
        } catch (err) {
          console.error("Auth init failed", err);
          logout();
        }
      }
      setLoading(false);
    };
    void initAuth();
  }, []);

  const login = (token, userData) => {
    if (typeof token === 'string') {
      localStorage.setItem('auth_token', token);
    }
    const cleanUser = sanitizeUserData(userData);
    if (cleanUser) {
      localStorage.setItem('user', JSON.stringify(cleanUser));
      setUser(cleanUser);
    }
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
