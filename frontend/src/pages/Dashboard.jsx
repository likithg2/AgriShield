import React, { useContext, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AuthContext } from '../context/AuthContext';
import GlassCard from '../components/GlassCard';
import Button from '../components/Button';
import { farmersAPI, notificationsAPI, authAPI, shipmentsAPI } from '../utils/api';
import { Package, Trash2, Bell, Edit2, Check, X, Truck, AlertTriangle, Search, Filter, KeyRound, Eye, EyeOff, History } from 'lucide-react';
import { useResendTimer } from '../hooks/useResendTimer';

const getCropEmoji = (crop) => {
  const map = { "Tomato": "🍅", "Onion": "🧅", "Cucumber": "🥒", "Potato": "🥔" };
  return map[crop] || "📦";
};

const Dashboard = () => {
  const { user, login, logout, selectedAdminWarehouseId, setAdminWarehouse } = useContext(AuthContext); // we can use login() to update user state if needed, or just reload
  
  const [dashboardData, setDashboardData] = useState(null);
  const [managerData, setManagerData] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [allWarehouses, setAllWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Profile Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
    district: user?.district || '',
    email: user?.email || '',
  });
  const [updateMsg, setUpdateMsg] = useState({ type: '', text: '' });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showNotificationHistory, setShowNotificationHistory] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [selectedActiveShipment, setSelectedActiveShipment] = useState(null);

  const handleDeleteAccount = async () => {
    try {
      await authAPI.deleteAccount();
      logout();
      toast.success("Account deleted successfully");
    } catch (err) {
      toast.error("Failed to delete account. Please try again.");
    }
  };


  // Active Shipments State
  const [activeShipmentsSearch, setActiveShipmentsSearch] = useState('');
  const [activeShipmentsFilter, setActiveShipmentsFilter] = useState('');
  const [spoilageCropFilter, setSpoilageCropFilter] = useState('');
  const [activeShipmentsPage, setActiveShipmentsPage] = useState(1);
  const SHIPMENTS_PER_PAGE = 10;

  // Email OTP States
  const [showEmailOTP, setShowEmailOTP] = useState(false);
  const [emailOTP, setEmailOTP] = useState('');
  const [showEmailOtpPassword, setShowEmailOtpPassword] = useState(false);
  const { timeLeft, isTimerActive, startTimer, formattedTime } = useResendTimer(120);

  // Real-time ticking state
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, selectedAdminWarehouseId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const notifRes = await notificationsAPI.list();
      let notifs = notifRes.data;

      if (user.role === 'farmer') {
        setNotifications(notifs);
        const res = await farmersAPI.getDashboard();
        setDashboardData(res.data);
      } else {
        const { warehousesAPI } = await import('../utils/api');
        const whRes = await warehousesAPI.list();
        setAllWarehouses(whRes.data);
        
        let selectedWh = null;
        if (user.role === 'admin') {
          if (!selectedAdminWarehouseId && whRes.data.length > 0) {
            setAdminWarehouse(whRes.data[0].id);
            selectedWh = whRes.data[0];
          } else if (selectedAdminWarehouseId) {
            selectedWh = whRes.data.find(w => w.id === selectedAdminWarehouseId);
          }
        } else {
          selectedWh = whRes.data.find(w => w.id === user.managed_warehouse_id);
        }

        const allShipmentsRes = await shipmentsAPI.list(); // to get all statuses
        let shipments = allShipmentsRes.data;
        if (selectedWh) {
          shipments = shipments.filter(s => s.destination === selectedWh.facility_name);
          const whShipmentIds = new Set(shipments.map(s => s.id));
          notifs = notifs.filter(n => n.shipment_id ? whShipmentIds.has(n.shipment_id) : true);
        }
        
        setNotifications(notifs);

        setManagerData({
          refrig_fault: selectedWh?.base_temp_c > 10.0,
          in_storage: shipments.filter(s => s.status === 'In Storage').length,
          in_transit: shipments.filter(s => s.status === 'In Transit' || s.status === 'Delivered').length,
          dispatched: shipments.filter(s => ['Listed (Standard Mandi)', 'Listed (Accelerated)', 'Redirected', 'Awaiting Buyer Pickup Confirmation'].includes(s.status)).length,
          active_shipments: shipments.filter(s => s.status === 'In Transit' || s.status === 'Delivered' || String(s.status).startsWith('Listed') || s.status === 'Redirected' || s.status === 'In Storage' || s.status === 'Awaiting Buyer Pickup Confirmation')
        });
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data", error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id) => {
    try {
      await notificationsAPI.markAsRead(id);
      setNotifications(notifications.map(n => 
        n.id === id ? { ...n, is_read: true } : n
      ));
    } catch (err) {
      console.error("Failed to mark as read", err);
    }
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setUpdateMsg({ type: '', text: '' });
    
    // If email is changed, we need OTP verification first
    if (editForm.email !== user.email) {
      try {
        await authAPI.requestEmailOTP(editForm.email);
        setShowEmailOTP(true);
        startTimer();
      } catch (err) {
        setUpdateMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to send OTP.' });
      }
      return;
    }
    
    // Otherwise just update profile
    executeProfileUpdate();
  };

  const executeProfileUpdate = async () => {
    try {
      const res = await authAPI.updateProfile(editForm);
      const token = localStorage.getItem('auth_token');
      login(token, res.data);
      toast.success('Profile updated successfully!');
      setIsEditing(false);
    } catch (err) {
      setUpdateMsg({ type: 'error', text: 'Failed to update profile.' });
    }
  };

  const handleVerifyEmailOTP = async (e) => {
    e.preventDefault();
    setUpdateMsg({ type: '', text: '' });
    try {
      await authAPI.verifyEmailOTP(editForm.email, emailOTP);
      // After successful email verification, update the rest of the profile
      executeProfileUpdate();
      setShowEmailOTP(false);
      setEmailOTP('');
    } catch (err) {
      setUpdateMsg({ type: 'error', text: err.response?.data?.detail || 'Invalid or expired OTP.' });
    }
  };
  
  const handleResendEmailOTP = async () => {
    if (isTimerActive) return;
    try {
      await authAPI.requestEmailOTP(editForm.email);
      startTimer();
    } catch (err) {
      setUpdateMsg({ type: 'error', text: 'Failed to resend OTP.' });
    }
  };

  if (!user) return <Navigate to="/login" />;

  if (loading) {
    return <div className="p-8 text-center text-text-muted">Loading dashboard...</div>;
  }

  const activeShipmentsList = user.role === 'farmer' ? dashboardData?.active_shipments : managerData?.active_shipments;

  const getDynamicDaysLeft = (shipment) => {
    if (!shipment.shelf_days_calculated) return null;
    if (!shipment.created_at) return shipment.shelf_days_calculated;
    const createdDate = new Date(shipment.created_at);
    // Use the ticking currentTime instead of a static new Date()
    const daysElapsed = (currentTime - createdDate.getTime()) / (1000 * 60 * 60 * 24);
    const timeLeft = shipment.shelf_days_calculated - daysElapsed;
    return Math.max(0, timeLeft);
  };

  const getRiskClasses = (days) => {
    if (days === null) return { bg: 'bg-white/60 hover:bg-white border-primary/20', text: 'text-green-900', muted: 'text-green-800/80', time: 'text-green-700' };
    if (days < 2) return { bg: 'bg-red-100 hover:bg-red-200 border-red-200', text: 'text-red-900', muted: 'text-red-800/80', time: 'text-red-700' };
    if (days < 5) return { bg: 'bg-yellow-100 hover:bg-yellow-200 border-yellow-200', text: 'text-yellow-900', muted: 'text-yellow-800/80', time: 'text-yellow-700' };
    return { bg: 'bg-green-100 hover:bg-green-200 border-green-300', text: 'text-green-900', muted: 'text-green-800/80', time: 'text-green-700' };
  };

  const trackedShipments = (activeShipmentsList || [])
    .filter(s => {
      if (spoilageCropFilter && s.crop !== spoilageCropFilter) return false;
      if (user?.role !== 'farmer' && s.status !== 'In Storage') return false;
      return true;
    })
    .map(s => ({
      ...s,
      dynamic_days_left: getDynamicDaysLeft(s)
    }))
    .sort((a, b) => {
      const aTime = a.dynamic_days_left ?? 999;
      const bTime = b.dynamic_days_left ?? 999;
      return aTime - bTime;
    });

  const filteredActiveShipments = (activeShipmentsList || []).filter(s => {
    const searchLower = activeShipmentsSearch.toLowerCase();
    const matchesSearch = (s.booking_id || '').toLowerCase().includes(searchLower) ||
                          (s.crop || '').toLowerCase().includes(searchLower) ||
                          (s.destination || '').toLowerCase().includes(searchLower) ||
                          (s.vehicle_reg_number || '').toLowerCase().includes(searchLower);
    const matchesStatus = activeShipmentsFilter ? s.status === activeShipmentsFilter : true;
    return matchesSearch && matchesStatus;
  });

  const totalActiveShipmentsPages = Math.max(1, Math.ceil(filteredActiveShipments.length / SHIPMENTS_PER_PAGE));
  const currentActiveShipments = filteredActiveShipments.slice((activeShipmentsPage - 1) * SHIPMENTS_PER_PAGE, activeShipmentsPage * SHIPMENTS_PER_PAGE);

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 pb-12">
      
      {/* HEADER & PROFILE */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-text-muted">Welcome back, {user.full_name}</p>
        </div>
        
        <div className="flex items-center gap-4">
          {user.role === 'admin' && allWarehouses.length > 0 && (
            <div className="flex items-center gap-3 bg-white/40 dark:bg-black/20 px-4 py-2 rounded-xl border border-glass-border">
              <span className="text-sm font-medium text-text-muted">Supervising:</span>
              <select
                value={selectedAdminWarehouseId || ''}
                onChange={(e) => setAdminWarehouse(parseInt(e.target.value))}
                className="input-field py-1 px-3 text-sm min-w-[200px] dark:bg-black/90 dark:text-white"
              >
                {allWarehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.facility_name} ({w.district})</option>
                ))}
              </select>
            </div>
          )}
          <Button variant="secondary" onClick={() => setIsEditing(!isEditing)} icon={isEditing ? X : Edit2}>
            {isEditing ? 'Cancel Edit' : 'Edit Profile'}
          </Button>
        </div>
      </div>

      {/* PROFILE EDIT FORM */}
      {isEditing && (
        <GlassCard className="p-6 bg-white/60 dark:bg-black/30 border-primary/20">
          <h2 className="text-xl font-bold mb-4">Edit Profile</h2>
          {updateMsg.text && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${updateMsg.type === 'success' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
              {updateMsg.text}
            </div>
          )}
          {!showEmailOTP ? (
            <form onSubmit={handleProfileUpdate} className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium mb-1">Full Name</label>
                <input type="text" className="input-field" value={editForm.full_name} onChange={e => setEditForm({...editForm, full_name: e.target.value})} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input type="text" className="input-field" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input type="email" className="input-field" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} required />
              </div>
              {user?.role === 'farmer' && (
                <div>
                  <label className="block text-sm font-medium mb-1">District</label>
                  <select value={editForm.district} onChange={e => setEditForm({...editForm, district: e.target.value})} className="input-field pl-3 bg-primary/10 dark:bg-black/90 dark:text-white" required>
                    <option value="">Select District</option>
                    {["Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban", "Bidar", "Chamarajanagar", "Chikkaballapur", "Chitradurga", "Dakshina Kannada", "Davangere", "Dharwad", "Gadag", "Hassan", "Haveri", "Kalaburagi", "Kodagu", "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur", "Ramanagara", "Shivamogga", "Tumakuru", "Udupi", "Uttara Kannada", "Vijayanagar", "Vijayapura", "Yadgir"].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="md:col-span-2 flex justify-between mt-4 border-t border-gray-200 dark:border-gray-800 pt-4">
                <Button type="button" variant="secondary" onClick={() => setShowDeleteModal(true)} className="bg-red-50 dark:bg-red-900/20 text-danger hover:bg-red-100 dark:hover:bg-red-900/40 border-red-200 dark:border-red-800" icon={Trash2}>Delete Account</Button>
                <Button type="submit" icon={Check}>Save Changes</Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifyEmailOTP} className="space-y-4">
              <div className="p-4 bg-warning/10 text-warning rounded-lg text-sm mb-4">
                You are changing your email. An OTP has been sent to <strong>{editForm.email}</strong>.
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium ml-1">6-Digit OTP</label>
                <div className="relative">
                  {!emailOTP && (
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                      <KeyRound size={18} />
                    </div>
                  )}
                  <input 
                    type={showEmailOtpPassword ? "text" : "password"} 
                    value={emailOTP}
                    onChange={(e) => setEmailOTP(e.target.value)}
                    className={`input-field ${emailOTP ? 'pl-4' : 'pl-10'} pr-10 bg-primary/10 dark:bg-primary/20 tracking-widest`}
                    maxLength="6"
                    required
                  />
                  <button type="button" onClick={() => setShowEmailOtpPassword(!showEmailOtpPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main" tabIndex="-1">
                    {showEmailOtpPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="flex gap-4 justify-between items-center">
                <button type="button" onClick={handleResendEmailOTP} disabled={isTimerActive} className="text-sm text-primary disabled:opacity-50 disabled:cursor-not-allowed font-medium hover:underline">
                  {isTimerActive ? `Resend OTP in ${formattedTime()}` : 'Resend OTP'}
                </button>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => setShowEmailOTP(false)}>Cancel</Button>
                  <Button type="submit">Verify & Save</Button>
                </div>
              </div>
            </form>
          )}
        </GlassCard>
      )}
      
      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {user.role === 'farmer' ? (
          <>
            <GlassCard>
              <h3 className="text-lg font-semibold mb-2">Total Shipments</h3>
              <p className="text-4xl font-bold text-primary">{dashboardData?.total_shipments || 0}</p>
            </GlassCard>
            <GlassCard>
              <h3 className="text-lg font-semibold mb-2">Tons Shipped</h3>
              <p className="text-4xl font-bold text-secondary">
                {dashboardData?.total_tons_shipped ? dashboardData.total_tons_shipped.toFixed(1) : '0.0'} <span className="text-xl font-normal text-text-muted">t</span>
              </p>
            </GlassCard>
            <GlassCard>
              <h3 className="text-lg font-semibold mb-2">Avg Spoilage</h3>
              <p className="text-4xl font-bold text-warning">
                {dashboardData?.avg_spoilage_rate ? dashboardData.avg_spoilage_rate.toFixed(1) : '0.0'}%
              </p>
            </GlassCard>
            <GlassCard>
              <h3 className="text-lg font-semibold mb-2">Cost Saved</h3>
              <p className="text-4xl font-bold text-success">
                ₹{dashboardData?.total_cost_saved ? dashboardData.total_cost_saved.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0'}
              </p>
            </GlassCard>
          </>
        ) : (
          <>
            <GlassCard>
              <h3 className="text-lg font-semibold mb-2">Refrigeration</h3>
              <p className={`text-3xl font-bold ${managerData?.refrig_fault ? 'text-danger' : 'text-success'}`}>
                {managerData?.refrig_fault ? '⚠️ FAULT' : '✅ NORMAL'}
              </p>
            </GlassCard>
            <GlassCard>
              <h3 className="text-lg font-semibold mb-2">In Storage (Vault)</h3>
              <p className="text-4xl font-bold text-secondary">
                {managerData?.in_storage || 0}
              </p>
            </GlassCard>
            <GlassCard>
              <h3 className="text-lg font-semibold mb-2">Pending Inspection</h3>
              <p className="text-4xl font-bold text-warning">
                {managerData?.in_transit || 0}
              </p>
            </GlassCard>
            <GlassCard>
              <h3 className="text-lg font-semibold mb-2">Dispatched/Shipped</h3>
              <p className="text-4xl font-bold text-success">
                {managerData?.dispatched || 0}
              </p>
            </GlassCard>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ACTIVE SHIPMENTS */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Truck size={24} className="text-primary"/> Active Shipments
            </h2>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input 
                  type="text" 
                  placeholder="Search shipments..." 
                  value={activeShipmentsSearch}
                  onChange={(e) => { setActiveShipmentsSearch(e.target.value); setActiveShipmentsPage(1); }}
                  className="input-field py-1.5 text-sm w-[200px] bg-background/50"
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
              <div className="relative">
                <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <select 
                  value={activeShipmentsFilter}
                  onChange={(e) => { setActiveShipmentsFilter(e.target.value); setActiveShipmentsPage(1); }}
                  className="input-field py-1.5 text-sm bg-background/50 dark:bg-black/90 dark:text-white appearance-none"
                  style={{ paddingLeft: '2.5rem' }}
                >
                  <option value="">All Statuses</option>
                  <option value="In Transit">In Transit</option>
                  <option value="In Storage">In Storage</option>
                  <option value="Redirected">Redirected</option>
                  <option value="Listed (Standard Mandi)">Listed (Standard Mandi)</option>
                  <option value="Listed (Accelerated)">Listed (Accelerated)</option>
                </select>
              </div>
            </div>
          </div>
          
          {filteredActiveShipments.length > 0 ? (
            <div className="space-y-4">
              {currentActiveShipments.map(shipment => (
                  <GlassCard 
                    key={shipment.id} 
                    className="p-4 hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedActiveShipment(shipment)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="font-mono text-xs text-text-muted">
                          Booking #{shipment.booking_id} {shipment.vehicle_reg_number ? `| Vehicle: ${shipment.vehicle_reg_number}` : ''}
                        </span>
                        <h4 className="text-lg font-bold">{getCropEmoji(shipment.crop)} {shipment.crop} <span className="text-sm font-normal text-text-muted">({shipment.tonnage} tons)</span></h4>
                      </div>
                      <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-semibold capitalize border border-primary/20">
                        {shipment.status === 'Delivered' ? 'Reached' : shipment.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm text-text-muted mt-4">
                      <span>To: <span className="font-medium text-text-main">{shipment.destination}</span></span>
                      <span>ETA: <span className="font-medium text-text-main">{shipment.status === 'Delivered' ? 'N/A' : (shipment.eta_hours ? parseFloat(shipment.eta_hours).toFixed(1) + ' hrs' : '-')}</span></span>
                      <span className="flex items-center gap-1">
                        Risk: 
                        <span className={`font-medium capitalize ${
                          (shipment.risk_status || '').toLowerCase() === 'high' ? 'text-danger' : 
                          (shipment.risk_status || '').toLowerCase() === 'medium' ? 'text-warning' : 'text-success'
                        }`}>
                          {shipment.risk_status}
                        </span>
                      </span>
                    </div>
                  </GlassCard>
                ))}
                
                {totalActiveShipmentsPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-glass-border text-sm">
                    <span className="text-text-muted">
                      Showing {(activeShipmentsPage - 1) * SHIPMENTS_PER_PAGE + 1} to {Math.min(activeShipmentsPage * SHIPMENTS_PER_PAGE, filteredActiveShipments.length)} of {filteredActiveShipments.length}
                    </span>
                    <div className="flex gap-2">
                      <Button 
                        onClick={() => setActiveShipmentsPage(p => Math.max(1, p - 1))}
                        disabled={activeShipmentsPage === 1}
                        variant="secondary"
                        className="!py-1 !px-3 !min-h-0 text-sm"
                      >
                        Prev
                      </Button>
                      <Button 
                        onClick={() => setActiveShipmentsPage(p => Math.min(totalActiveShipmentsPages, p + 1))}
                        disabled={activeShipmentsPage === totalActiveShipmentsPages}
                        variant="secondary"
                        className="!py-1 !px-3 !min-h-0 text-sm"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <GlassCard className="p-8 text-center text-text-muted">
                No active shipments found.
              </GlassCard>
            )}
          </div>

        {/* NOTIFICATIONS & SPOILAGE TRACKER */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Bell size={24} className="text-secondary"/> Notifications
            </h2>
            <button 
              onClick={() => setShowNotificationHistory(true)}
              className="p-2 rounded-full hover:bg-white/10 transition-colors text-text-muted hover:text-primary"
              title="Notification History"
            >
              <History size={20} />
            </button>
          </div>
          <GlassCard className="p-0 overflow-hidden">
            <div className={`overflow-y-auto ${user?.role === 'farmer' ? 'max-h-[850px]' : 'max-h-[450px]'}`}>
              {notifications.filter(n => !n.is_read).length > 0 ? (
                <div className="divide-y divide-glass-border">
                  {(user?.role === 'farmer' ? notifications.filter(n => !n.is_read).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10) : notifications.filter(n => !n.is_read).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5)).map(notif => (
                    <div key={notif.id} 
                         className="p-4 bg-primary/5 hover:bg-primary/10 cursor-pointer transition-colors"
                         onClick={() => setSelectedNotification(notif)}>
                      <div className="flex justify-between items-start gap-2 mb-1">
                        <h4 className="font-semibold text-sm flex items-center gap-2">
                          {notif.type === 'dispatch_alert' && <AlertTriangle size={14} className="text-warning" />}
                          {notif.title}
                        </h4>
                        {!notif.is_read && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleMarkAsRead(notif.id); }}
                            className="text-xs text-primary hover:underline whitespace-nowrap"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-text-muted mb-2 line-clamp-1">{notif.message.split('\n')[0]}</p>
                      <span className="text-xs text-text-muted/50">
                        {new Date(notif.created_at).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-text-muted">
                  You're all caught up!
                </div>
              )}
            </div>
          </GlassCard>

          {user?.role !== 'farmer' && (
            <>
              <div className="flex justify-between items-center pt-4">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <AlertTriangle size={24} className="text-yellow-500" /> Spoilage Tracker
                </h2>
                <select 
                  value={spoilageCropFilter}
                  onChange={(e) => setSpoilageCropFilter(e.target.value)}
                  className="input-field py-1 px-3 text-sm min-w-[120px] bg-background/50 dark:bg-black/90 dark:text-white border border-white/10"
                >
                  <option value="">All Crops</option>
                  <option value="Tomato">Tomato</option>
                  <option value="Onion">Onion</option>
                  <option value="Potato">Potato</option>
                  <option value="Cucumber">Cucumber</option>
                </select>
              </div>
              <GlassCard className="p-0 overflow-hidden bg-[#e8f5e9] border border-primary/30 text-green-900 shadow-md">
                <div className="max-h-[300px] overflow-y-auto p-4 space-y-3">
                  {(!trackedShipments || trackedShipments.length === 0) ? (
                    <div className="p-8 text-center text-green-900/60 font-medium">
                      No active shipments to track.
                    </div>
                  ) : (
                    trackedShipments.map(shipment => {
                      const styles = getRiskClasses(shipment.dynamic_days_left);
                      return (
                    <div key={shipment.id} className={`${styles.bg} p-3 rounded-lg border flex justify-between items-center transition-colors shadow-sm`}>
                      <div>
                        <div className={`font-bold ${styles.text}`}>{shipment.crop}</div>
                        <div className={`text-xs ${styles.muted} font-medium`}>{shipment.tonnage} tons</div>
                      </div>
                      <div className="text-right">
                        <div className={`font-bold ${styles.time} font-mono`}>
                          {shipment.dynamic_days_left !== null ? shipment.dynamic_days_left.toFixed(5) : 'N/A'} days left
                        </div>
                        <div className={`text-xs ${styles.muted} capitalize font-medium mt-0.5`}>{shipment.status.replace('_', ' ')}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </GlassCard>
          </>
          )}
        </div>
      </div>

      {showNotificationHistory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl max-w-2xl w-full shadow-2xl space-y-4 border border-glass-border flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center pb-4 border-b border-glass-border shrink-0">
              <h3 className="text-xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                <History className="text-primary" /> Notification History
              </h3>
              <button onClick={() => setShowNotificationHistory(false)} className="text-text-muted hover:text-danger">
                <X size={24} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 pr-2 space-y-2">
              {notifications.length > 0 ? (
                notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(notif => (
                  <div key={notif.id} 
                       className={`p-4 hover:bg-white/5 cursor-pointer transition-colors ${!notif.is_read ? 'bg-primary/10' : ''}`}
                       onClick={() => setSelectedNotification(notif)}>
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                        {notif.type === 'dispatch_alert' && <AlertTriangle size={16} className="text-warning" />}
                        {notif.title}
                      </h4>
                      <span className="text-xs text-text-muted">
                        {new Date(notif.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-text-muted line-clamp-2">{notif.message.split('\n')[0]}</p>
                  </div>
                ))
              ) : (
                <div className="text-center p-8 text-text-muted">
                  No read notifications history found.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-6 border border-glass-border">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-danger mb-2">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Delete Account?</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Are you sure you want to permanently delete your account? This action cannot be undone and all your data will be lost.
              </p>
            </div>
            <div className="flex gap-4 w-full">
              <Button type="button" variant="secondary" className="flex-1 justify-center" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
              <Button type="button" className="flex-1 justify-center bg-danger hover:bg-red-600 text-white border-0" onClick={handleDeleteAccount}>Yes, Delete</Button>
            </div>
          </div>
        </div>
      )}

      {/* NOTIFICATION DETAILS MODAL */}
      {selectedNotification && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-md z-[60] flex items-center justify-center p-4">
          <div className="w-full max-w-lg flex flex-col p-0 border border-white/60 shadow-[0_8px_32px_rgba(255,255,255,0.15)] overflow-hidden rounded-2xl bg-white/70 dark:bg-white/10 backdrop-blur-2xl">
            <div className="p-4 border-b border-white/30 flex justify-between items-center bg-white/40 dark:bg-black/40">
              <h2 className="text-lg font-bold flex items-center gap-2 text-text-main">
                {selectedNotification.type === 'dispatch_alert' ? <AlertTriangle size={20} className="text-warning" /> : <Bell size={20} className="text-primary" />}
                {selectedNotification.title}
              </h2>
              <button 
                onClick={() => setSelectedNotification(null)}
                className="p-1 rounded-full hover:bg-white/10 text-text-muted hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <span className="text-xs text-text-muted block mb-4 border-b border-white/5 pb-2">
                Received: {new Date(selectedNotification.created_at).toLocaleString()}
              </span>
              <div className="text-sm text-text-main whitespace-pre-wrap leading-relaxed">
                {selectedNotification.message}
              </div>
            </div>
            
            <div className="p-4 border-t border-glass-border bg-white/5 dark:bg-black/20 flex justify-end">
              <Button onClick={() => setSelectedNotification(null)} variant="primary" className="!py-2 !px-6">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE SHIPMENT DETAILS MODAL */}
      {selectedActiveShipment && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-md z-[60] flex items-center justify-center p-4">
          <div className="w-full max-w-2xl flex flex-col p-0 border border-white/60 shadow-[0_8px_32px_rgba(255,255,255,0.15)] overflow-hidden rounded-2xl bg-white/70 dark:bg-white/10 backdrop-blur-2xl">
            <div className="p-4 border-b border-white/30 flex justify-between items-center bg-white/40 dark:bg-black/40">
              <h2 className="text-xl font-bold flex items-center gap-2 text-text-main">
                <Truck size={20} className="text-primary" /> Shipment #{selectedActiveShipment.booking_id}
              </h2>
              <button 
                onClick={() => setSelectedActiveShipment(null)}
                className="p-1 rounded-full hover:bg-white/10 text-text-muted hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[70vh]">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-2xl font-bold flex items-center gap-2 mb-1">
                    {getCropEmoji(selectedActiveShipment.crop)} {selectedActiveShipment.crop}
                  </h3>
                  <div className="text-sm text-text-muted">
                    Created: {new Date(selectedActiveShipment.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="px-4 py-1.5 bg-primary/20 text-primary border border-primary/30 rounded-full font-bold text-sm tracking-wider uppercase">
                  {selectedActiveShipment.status.replace('_', ' ')}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white/50 dark:bg-white/5 p-3 rounded-xl border border-white/40 shadow-sm backdrop-blur-md">
                  <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">Quantity</div>
                  <div className="font-bold text-lg text-text-main">{selectedActiveShipment.tonnage} Tons</div>
                </div>
                <div className="bg-white/50 dark:bg-white/5 p-3 rounded-xl border border-white/40 shadow-sm backdrop-blur-md">
                  <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">Risk Level</div>
                  <div className={`font-bold text-lg ${
                    (selectedActiveShipment.risk_status || '').toLowerCase() === 'high' ? 'text-danger' : 
                    (selectedActiveShipment.risk_status || '').toLowerCase() === 'medium' ? 'text-warning' : 'text-success'
                  }`}>{selectedActiveShipment.risk_status || 'LOW'}</div>
                </div>
                <div className="bg-white/50 dark:bg-white/5 p-3 rounded-xl border border-white/40 shadow-sm backdrop-blur-md">
                  <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">Shelf Life</div>
                  <div className="font-bold text-lg text-text-main">{selectedActiveShipment.shelf_days_calculated ? `${selectedActiveShipment.shelf_days_calculated.toFixed(1)} days` : '-'}</div>
                </div>
                <div className="bg-white/50 dark:bg-white/5 p-3 rounded-xl border border-white/40 shadow-sm backdrop-blur-md">
                  <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">Vehicle Reg</div>
                  <div className="font-bold text-lg text-text-main">{selectedActiveShipment.vehicle_reg_number || 'N/A'}</div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="border border-white/40 rounded-xl p-5 bg-white/40 dark:bg-white/5 shadow-sm backdrop-blur-md">
                  <h3 className="font-semibold text-primary mb-3 text-lg flex items-center gap-2">
                    <Truck size={18} /> Logistics Route
                  </h3>
                  <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
                    {selectedActiveShipment.prediction?.district && (
                      <div><span className="text-text-muted">Origin:</span> <span className="font-medium">{selectedActiveShipment.prediction.district}</span></div>
                    )}
                    {selectedActiveShipment.destination && (
                      <div><span className="text-text-muted">Destination:</span> <span className="font-medium">{selectedActiveShipment.destination}</span></div>
                    )}
                    {selectedActiveShipment.distance_km != null && selectedActiveShipment.distance_km !== '' && (
                      <div><span className="text-text-muted">Distance:</span> <span className="font-medium">{selectedActiveShipment.distance_km} km</span></div>
                    )}
                    {selectedActiveShipment.eta_hours != null && selectedActiveShipment.eta_hours !== '' && (
                      <div><span className="text-text-muted">Est. Arrival:</span> <span className="font-medium">{parseFloat(selectedActiveShipment.eta_hours).toFixed(1)} hrs</span></div>
                    )}
                  </div>
                </div>
                
                {selectedActiveShipment.prediction && (
                  <div className="border border-white/40 rounded-xl p-5 bg-white/40 dark:bg-white/5 shadow-sm backdrop-blur-md mt-4">
                    <h3 className="font-semibold text-secondary mb-3 text-lg">Predicted Loss Metrics</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 text-sm">
                      <div><span className="text-text-muted">Vol. Loss:</span> <span className="font-bold text-lg ml-1">{selectedActiveShipment.prediction.loss_percentage}%</span></div>
                      <div><span className="text-text-muted">Fin. Loss:</span> <span className="font-bold text-lg text-red-400 ml-1">~ ₹{Math.round(selectedActiveShipment.prediction.financial_loss).toLocaleString()}</span></div>
                      <div><span className="text-text-muted">Mandi Price:</span> <span className="font-bold text-lg ml-1">₹{selectedActiveShipment.prediction.mandi_price_per_kg}/kg</span></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-4 border-t border-white/30 bg-white/40 dark:bg-black/40 flex justify-end">
              <Button onClick={() => setSelectedActiveShipment(null)} variant="primary" className="!py-2 !px-6">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Dashboard;
