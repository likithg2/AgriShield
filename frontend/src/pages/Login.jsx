import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Leaf, Lock, Mail, ArrowRight, KeyRound, Eye, EyeOff } from 'lucide-react';
import GlassCard from '../components/GlassCard';
import Button from '../components/Button';
import { authAPI } from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { ThemeContext } from '../context/ThemeContext';
import { useResendTimer } from '../hooks/useResendTimer';

const Login = () => {
  const [view, setView] = useState('login'); // 'login', 'otp-request', 'otp-verify', 'forgot-password', 'reset-password'
  
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const { timeLeft, isTimerActive, startTimer, formattedTime } = useResendTimer(120);

  const [showPassword, setShowPassword] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Registration States
  const [role, setRole] = useState('farmer'); // 'farmer' | 'warehouse_manager'
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [district, setDistrict] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [warehouses, setWarehouses] = useState([]);

  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        const { warehousesAPI } = await import('../utils/api');
        const res = await warehousesAPI.list();
        setWarehouses(res.data);
      } catch (err) {
        console.error("Failed to load warehouses", err);
      }
    };
    if (view === 'register' && role === 'warehouse_manager' && warehouses.length === 0) {
      void fetchWarehouses();
    }
  }, [view, role, warehouses.length]);

  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  const navigate = useNavigate();
  const { user, login } = useContext(AuthContext);

  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  
  const handleRegisterOTPRequest = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    try {
      await authAPI.sendRegisterOTP(loginId); // loginId holds the email here
      setSuccessMsg('OTP sent to ' + loginId);
      setView('register-verify');
      startTimer();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to send OTP.'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    try {
      const data = {
        full_name: fullName,
        phone,
        email: loginId,
        password,
        role,
        otp,
        district: role === 'farmer' ? district : null,
        managed_warehouse_id: role === 'warehouse_manager' ? Number.parseInt(warehouseId, 10) : null,
      };
      const res = await authAPI.register(data);
      login(res.data.access_token, res.data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(getErrorMessage(err, 'Registration failed.'));
    } finally {
      setLoading(false);
    }
  };

  const clearMessages = () => {
    setError('');
    setSuccessMsg('');
  };

  const getErrorMessage = (err, defaultMsg) => {
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map(d => d.msg).join(', ');
    return defaultMsg;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    try {
      const res = await authAPI.login(loginId, password);
      login(res.data.access_token, res.data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(getErrorMessage(err, 'Login failed. Please check your credentials.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    try {
      await authAPI.sendOTP(loginId);
      setSuccessMsg('OTP sent successfully!');
      setView('otp-verify');
      startTimer();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to send OTP.'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTPLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    try {
      const res = await authAPI.verifyOTPLogin(loginId, otp);
      login(res.data.access_token, res.data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(getErrorMessage(err, 'Invalid or expired OTP.'));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    try {
      await authAPI.forgotPassword(loginId);
      setSuccessMsg('Password reset code sent!');
      setView('reset-password');
      startTimer();
    } catch (err) {
      setError(getErrorMessage(err, 'Account not found.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    try {
      await authAPI.resetPassword(loginId, otp, newPassword);
      setSuccessMsg('Password reset successfully! You can now log in.');
      setView('login');
      setPassword('');
      setOtp('');
      setNewPassword('');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to reset password. Invalid OTP.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center relative min-h-[80vh]">
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob"></div>
      <div className="absolute top-1/3 right-1/4 w-72 h-72 bg-secondary/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000"></div>
      
      <GlassCard className="w-full max-w-md relative z-10 p-8 border-t border-l border-white/40 shadow-2xl backdrop-blur-xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
            <Leaf size={32} />
          </div>
          
          <h1 className="text-3xl font-bold mb-2">
            {view === 'login' && 'Welcome Back'}
            {view === 'register' && 'Create an Account'}
            {view === 'register-verify' && 'Verify Email'}
            {view === 'otp-request' && 'Login via OTP'}
            {view === 'otp-verify' && 'Verify OTP'}
            {view === 'forgot-password' && 'Reset Password'}
            {view === 'reset-password' && 'Create New Password'}
          </h1>
          <p className="text-text-muted">
            {view === 'login' && 'Enter your credentials to access your dashboard'}
            {view === 'register' && 'Join the Post-Harvest network'}
            {view === 'register-verify' && `Enter the OTP sent to ${loginId}`}
            {view === 'otp-request' && 'Enter your email or phone to receive a code'}
            {view === 'otp-verify' && `Enter the code sent to ${loginId}`}
            {view === 'forgot-password' && 'We will send you a reset code'}
            {view === 'reset-password' && 'Enter the reset code and your new password'}
          </p>

        </div>
        
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm flex items-start gap-2">
            <span className="mt-0.5">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 rounded-lg bg-success/10 border border-success/20 text-success text-sm flex items-start gap-2">
            <span className="mt-0.5">✅</span>
            <span>{successMsg}</span>
          </div>
        )}
        
        
        {/* VIEW: REGISTER */}
        {view === 'register' && (
          <form autoComplete="off" onSubmit={handleRegisterOTPRequest} className="space-y-4">
            
            <div className="flex gap-2 mb-4 p-1 bg-white/20 dark:bg-black/20 rounded-lg">
              <button type="button" onClick={() => setRole('farmer')} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${role === 'farmer' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:text-text-main'}`}>Farmer</button>
              <button type="button" onClick={() => setRole('warehouse_manager')} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${role === 'warehouse_manager' ? 'bg-secondary text-white shadow-md' : 'text-text-muted hover:text-text-main'}`}>Warehouse Mgr</button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="reg-fullname" className="text-xs font-medium ml-1">Full Name</label>
                <input id="reg-fullname" type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="input-field pl-3 bg-primary/10 dark:bg-primary/20" required />
              </div>
              <div className="space-y-1">
                <label htmlFor="reg-phone" className="text-xs font-medium ml-1">Phone</label>
                <input id="reg-phone" type="text" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} pattern="[0-9]{10}" title="Phone number must be exactly 10 digits" className="input-field pl-3 bg-primary/10 dark:bg-primary/20" required />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="reg-email" className="text-xs font-medium ml-1">Email</label>
              <input id="reg-email" type="email" value={loginId} autoComplete="off" onChange={e => setLoginId(e.target.value)} className="input-field pl-3 bg-primary/10 dark:bg-primary/20" required />
            </div>
            
            <div className="space-y-1">
              <label htmlFor="reg-password" className="text-xs font-medium ml-1">Password</label>
              <div className="relative">
                <input id="reg-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className="input-field pl-3 pr-10 bg-primary/10 dark:bg-primary/20" required minLength="6" title="Password must be at least 6 characters long" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main" tabIndex="-1">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-[10px] text-text-muted ml-1 mt-0.5">Must be at least 6 characters</p>
            </div>

            {role === 'farmer' && (
              <div className="space-y-1">
                <label htmlFor="reg-district" className="text-xs font-medium ml-1">District</label>
                <select id="reg-district" value={district} onChange={e => setDistrict(e.target.value)} className="input-field pl-3 bg-primary/10 dark:bg-black/90 dark:text-white" required>
                  <option value="">Select District</option>
                  {["Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban", "Bidar", "Chamarajanagar", "Chikkaballapur", "Chitradurga", "Dakshina Kannada", "Davangere", "Dharwad", "Gadag", "Hassan", "Haveri", "Kalaburagi", "Kodagu", "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur", "Ramanagara", "Shivamogga", "Tumakuru", "Udupi", "Uttara Kannada", "Vijayanagar", "Vijayapura", "Yadgir"].map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}

            {role === 'warehouse_manager' && (
              <div className="space-y-1">
                <label htmlFor="reg-warehouse" className="text-xs font-medium ml-1">Assigned Warehouse</label>
                <select id="reg-warehouse" value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className="input-field pl-3 bg-primary/10 dark:bg-black/90 dark:text-white" required>
                  <option value="">Select Warehouse</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.facility_name}</option>
                  ))}
                </select>
              </div>
            )}

            <Button type="submit" className="w-full justify-center mt-2 py-3 shadow-lg shadow-primary/30" disabled={loading}>
              {loading ? 'Sending OTP...' : 'Send OTP to Email'}
            </Button>
            
            <div className="text-center pt-2">
              <button type="button" onClick={() => { setView('login'); clearMessages(); }} className="text-sm text-text-muted hover:text-primary transition-colors">
                Already have an account? Login
              </button>
            </div>
          </form>
        )}

        {/* VIEW: REGISTER VERIFY */}
        {view === 'register-verify' && (
          <form autoComplete="off" onSubmit={handleRegisterSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="reg-verify-otp" className="text-sm font-medium ml-1">6-Digit OTP</label>
              <div className="relative">
                <input 
                  id="reg-verify-otp"
                  type={showOtp ? "text" : "password"}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className={`input-field pl-4 pr-10 bg-primary/10 dark:bg-primary/20 tracking-widest`}
                  maxLength="6"
                  required
                />
                <button type="button" onClick={() => setShowOtp(!showOtp)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main" tabIndex="-1">
                  {showOtp ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            
            <Button type="submit" className="w-full justify-center mt-4 py-3 text-lg font-semibold shadow-lg shadow-primary/30" disabled={loading}>
              {loading ? 'Creating Account...' : 'Verify & Create Account'}
              {!loading && <ArrowRight size={20} />}
            </Button>
            
            <div className="flex flex-col gap-2 text-center pt-2 mt-4">
              <button type="button" onClick={handleRegisterOTPRequest} disabled={isTimerActive || loading} className="text-sm text-primary font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:underline">
                {isTimerActive ? `Resend OTP in ${formattedTime()}` : 'Resend OTP'}
              </button>
              <button type="button" onClick={() => { setView('register'); clearMessages(); setOtp(''); }} className="text-sm text-text-muted hover:text-primary transition-colors mt-2">
                Back to Registration
              </button>
            </div>
          </form>
        )}

        {/* VIEW: LOGIN PASSWORD */}
        {view === 'login' && (
          <form autoComplete="off" onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="login-id" className="text-sm font-medium ml-1">Email or Phone</label>
              <div className="relative">
                {!loginId && (
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                    <Mail size={18} />
                  </div>
                )}
                <input 
                  id="login-id"
                  type="text" 
                  value={loginId} autoComplete="off"
                  onChange={(e) => setLoginId(e.target.value)}
                  className={`input-field ${loginId ? 'pl-4' : 'pl-10'} bg-primary/10 dark:bg-primary/20`}
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label htmlFor="login-password" className="text-sm font-medium">Password</label>
                <button type="button" onClick={() => { setView('forgot-password'); clearMessages(); }} className="text-xs text-primary hover:underline">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                {!password && (
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                    <Lock size={18} />
                  </div>
                )}
                <input 
                  id="login-password"
                  type={showPassword ? "text" : "password"} autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`input-field ${password ? 'pl-4' : 'pl-10'} pr-10 bg-primary/10 dark:bg-primary/20`}
                  required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main" tabIndex="-1">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            
            <Button 
              type="submit" 
              className="w-full justify-center mt-4 py-3 text-lg font-semibold shadow-lg shadow-primary/30"
              disabled={loading}
            >
              {loading ? 'Authenticating...' : 'Sign In'}
              {!loading && <ArrowRight size={20} />}
            </Button>
            <div className="text-center pt-2 flex flex-col gap-2">
              <button type="button" onClick={() => { setView('otp-request'); clearMessages(); }} className="text-sm text-text-muted hover:text-primary transition-colors">
                Or login with OTP instead
              </button>
              <button type="button" onClick={() => { setView('register'); clearMessages(); }} className="text-sm font-semibold text-primary hover:underline">
                Don't have an account? Register
              </button>
            </div>
          </form>        )}

        {/* VIEW: OTP REQUEST */}
        {view === 'otp-request' && (
          <form autoComplete="off" onSubmit={handleSendOTP} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="otp-req-id" className="text-sm font-medium ml-1">Email or Phone</label>
              <div className="relative">
                {!loginId && (
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                    <Mail size={18} />
                  </div>
                )}
                <input 
                  id="otp-req-id"
                  type="text" 
                  value={loginId} autoComplete="off"
                  onChange={(e) => setLoginId(e.target.value)}
                  className={`input-field ${loginId ? 'pl-4' : 'pl-10'} bg-primary/10 dark:bg-primary/20`}
                  required
                />
              </div>
            </div>
            
            <Button 
              type="submit" 
              className="w-full justify-center mt-4 py-3 text-lg font-semibold shadow-lg shadow-primary/30"
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send OTP'}
            </Button>
            
            <div className="text-center pt-2">
              <button type="button" onClick={() => { setView('login'); clearMessages(); }} className="text-sm text-text-muted hover:text-primary transition-colors">
                Back to Password Login
              </button>
            </div>
          </form>
        )}

        {/* VIEW: OTP VERIFY */}
        {view === 'otp-verify' && (
          <form autoComplete="off" onSubmit={handleVerifyOTPLogin} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="otp-verify-code" className="text-sm font-medium ml-1">6-Digit OTP</label>
              <div className="relative">
                {!otp && (
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                    <KeyRound size={18} />
                  </div>
                )}
                <input 
                  id="otp-verify-code"
                  type={showOtp ? "text" : "password"} 
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className={`input-field ${otp ? 'pl-4' : 'pl-10'} pr-10 bg-primary/10 dark:bg-primary/20 tracking-widest`}
                  maxLength="6"
                  required
                />
                <button type="button" onClick={() => setShowOtp(!showOtp)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main" tabIndex="-1">
                  {showOtp ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            
            <Button 
              type="submit" 
              className="w-full justify-center mt-4 py-3 text-lg font-semibold shadow-lg shadow-primary/30"
              disabled={loading}
            >
              {loading ? 'Verifying...' : 'Verify & Login'}
              {!loading && <ArrowRight size={20} />}
            </Button>
            
            <div className="flex flex-col gap-2 text-center pt-2 mt-4">
              <button type="button" onClick={handleSendOTP} disabled={isTimerActive || loading} className="text-sm text-primary font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:underline">
                {isTimerActive ? `Resend OTP in ${formattedTime()}` : 'Resend OTP'}
              </button>
              <button type="button" onClick={() => { setView('otp-request'); clearMessages(); setOtp(''); }} className="text-sm text-text-muted hover:text-primary transition-colors mt-2">
                Use a different email/phone?
              </button>
            </div>
          </form>
        )}

        {/* VIEW: FORGOT PASSWORD */}
        {view === 'forgot-password' && (
          <form autoComplete="off" onSubmit={handleForgotPassword} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="forgot-pwd-id" className="text-sm font-medium ml-1">Email or Phone</label>
              <div className="relative">
                {!loginId && (
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                    <Mail size={18} />
                  </div>
                )}
                <input 
                  id="forgot-pwd-id"
                  type="text" 
                  value={loginId} autoComplete="off"
                  onChange={(e) => setLoginId(e.target.value)}
                  className={`input-field ${loginId ? 'pl-4' : 'pl-10'} bg-primary/10 dark:bg-primary/20`}
                  required
                />
              </div>
            </div>
            
            <Button 
              type="submit" 
              className="w-full justify-center mt-4 py-3 text-lg font-semibold shadow-lg shadow-primary/30"
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send Reset Code'}
            </Button>
            
            <div className="text-center pt-2">
              <button type="button" onClick={() => { setView('login'); clearMessages(); }} className="text-sm text-text-muted hover:text-primary transition-colors">
                Back to Login
              </button>
            </div>
          </form>
        )}

        {/* VIEW: RESET PASSWORD */}
        {view === 'reset-password' && (
          <form autoComplete="off" onSubmit={handleResetPassword} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="reset-pwd-otp" className="text-sm font-medium ml-1">Reset Code (OTP)</label>
              <div className="relative">
                {!otp && (
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                    <KeyRound size={18} />
                  </div>
                )}
                <input 
                  id="reset-pwd-otp"
                  type={showOtp ? "text" : "password"} 
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className={`input-field ${otp ? 'pl-4' : 'pl-10'} pr-10 bg-primary/10 dark:bg-primary/20 tracking-widest`}
                  maxLength="6"
                  required
                />
                <button type="button" onClick={() => setShowOtp(!showOtp)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main" tabIndex="-1">
                  {showOtp ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="reset-pwd-new" className="text-sm font-medium ml-1">New Password</label>
              <div className="relative">
                {!newPassword && (
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                    <Lock size={18} />
                  </div>
                )}
                <input 
                  id="reset-pwd-new"
                  type={showNewPassword ? "text" : "password"} 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`input-field ${newPassword ? 'pl-4' : 'pl-10'} pr-10 bg-primary/10 dark:bg-primary/20`}
                  required
                />
                <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main" tabIndex="-1">
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            
            <Button 
              type="submit" 
              className="w-full justify-center mt-4 py-3 text-lg font-semibold shadow-lg shadow-primary/30"
              disabled={loading}
            >
              {loading ? 'Updating...' : 'Update Password'}
            </Button>
            
            <div className="flex flex-col gap-2 text-center pt-2 mt-4">
              <button type="button" onClick={handleForgotPassword} disabled={isTimerActive || loading} className="text-sm text-primary font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:underline">
                {isTimerActive ? `Resend Reset Code in ${formattedTime()}` : 'Resend Reset Code'}
              </button>
              <button type="button" onClick={() => { setView('forgot-password'); clearMessages(); setOtp(''); setNewPassword(''); }} className="text-sm text-text-muted hover:text-primary transition-colors mt-2">
                Back
              </button>
            </div>
          </form>
        )}
        
        {view === 'login' && (
          <div className="mt-8 text-center text-sm text-text-muted">
            <p>Demo Credentials:</p>
            <div className="mt-2 flex flex-col gap-1 opacity-70">
              <code>admin@postharvest.in / admin123</code>
              <code>farmer@postharvest.in / farmer123</code>
              <code>warehouse@postharvest.in / warehouse123</code>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
};

export default Login;
