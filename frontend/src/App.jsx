import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { NotificationProvider } from './context/NotificationContext';
import TopBar from './components/TopBar';

import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Predict from './pages/Predict';
import Warehouse from './pages/Warehouse';
import WarehouseLogs from './pages/WarehouseLogs';
import History from './pages/History';
import Statistics from './pages/Statistics';
import ChatWidget from './components/ChatWidget';

const ProtectedRoute = ({ children }) => {
  const { user } = React.useContext(AuthContext);
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const RootRedirect = () => {
  const { user } = React.useContext(AuthContext);
  return <Navigate to={user ? "/dashboard" : "/login"} replace />;
};

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <NotificationProvider>
              <div className="app-container relative">
                <TopBar />
                <ChatWidget />
                
                <main className="main-content">
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                    <Route path="/predict" element={<ProtectedRoute><Predict /></ProtectedRoute>} />
                    <Route path="/warehouse" element={<ProtectedRoute><Warehouse /></ProtectedRoute>} />
                    <Route path="/warehouse-logs" element={<ProtectedRoute><WarehouseLogs /></ProtectedRoute>} />
                    <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
                    <Route path="/statistics" element={<ProtectedRoute><Statistics /></ProtectedRoute>} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </main>
                <Toaster position="top-right" containerStyle={{ top: '100px' }} toastOptions={{ className: 'glass-card text-white bg-background border border-white/10' }} />
              </div>
            </NotificationProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
