import React, { useContext, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AuthContext } from '../context/AuthContext';
import { NotificationContext } from '../context/NotificationContext';
import GlassCard from '../components/GlassCard';
import Button from '../components/Button';
import { farmersAPI, shipmentsAPI, adminAPI } from '../utils/api';
import { Package, Bell, X, Truck, AlertTriangle, Search, Filter, History, Users, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const getCropEmoji = (crop) => {
  const map = { "Tomato": "🍅", "Onion": "🧅", "Cucumber": "🥒", "Potato": "🥔" };
  return map[crop] || "📦";
};

const Dashboard = () => {
  const { user, selectedAdminWarehouseId, setAdminWarehouse } = useContext(AuthContext);
  const { notifications: globalNotifs, openNotification, setShowNotificationHistory } = useContext(NotificationContext) || { notifications: [] };
  
  const [dashboardData, setDashboardData] = useState(null);
  const [managerData, setManagerData] = useState(null);
  const [allWarehouses, setAllWarehouses] = useState([]);
  const [whShipmentIds, setWhShipmentIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [selectedActiveShipment, setSelectedActiveShipment] = useState(null);

  // Admin User Management State
  const [showAdminUsersModal, setShowAdminUsersModal] = useState(false);
  const [adminUsersList, setAdminUsersList] = useState([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState(null);
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminResetSubmitting, setAdminResetSubmitting] = useState(false);

  const loadAdminUsers = async () => {
    try {
      setAdminUsersLoading(true);
      const res = await adminAPI.listUsers();
      setAdminUsersList(res.data);
    } catch (err) {
      toast.error('Failed to load users');
    } finally {
      setAdminUsersLoading(false);
    }
  };

  const handleAdminResetPassword = async (e) => {
    e.preventDefault();
    if (!resetTargetUser || !adminNewPassword) return;
    try {
      setAdminResetSubmitting(true);
      await adminAPI.resetUserPassword(resetTargetUser.id, adminNewPassword);
      toast.success(`Password reset for ${resetTargetUser.email}`);
      setResetTargetUser(null);
      setAdminNewPassword('');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to reset password');
    } finally {
      setAdminResetSubmitting(false);
    }
  };

  // Active Shipments State
  const [activeShipmentsSearch, setActiveShipmentsSearch] = useState('');
  const [activeShipmentsFilter, setActiveShipmentsFilter] = useState('');
  const [spoilageCropFilter, setSpoilageCropFilter] = useState('');
  const [activeShipmentsPage, setActiveShipmentsPage] = useState(1);
  const SHIPMENTS_PER_PAGE = 10;

  // Real-time ticking state
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (user) {
      void fetchData();
    }
  }, [user, selectedAdminWarehouseId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      if (user.role === 'farmer') {
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
          setWhShipmentIds(new Set(shipments.map(s => s.id)));
        } else {
          setWhShipmentIds(new Set());
        }

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

  const displayNotifs = user?.role === 'farmer' 
    ? globalNotifs 
    : globalNotifs.filter(n => n.shipment_id ? whShipmentIds.has(n.shipment_id) : true);

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
        
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full md:w-auto">
          {user.role === 'admin' && allWarehouses.length > 0 && (
            <div className="flex items-center gap-3 bg-white/40 dark:bg-black/20 px-4 py-2 rounded-xl border border-glass-border w-full sm:w-auto">
              <span className="text-sm font-medium text-text-muted shrink-0">Supervising:</span>
              <select
                value={selectedAdminWarehouseId || ''}
                onChange={(e) => setAdminWarehouse(Number.parseInt(e.target.value, 10))}
                className="input-field py-1 px-3 text-sm w-full sm:w-auto min-w-0 sm:min-w-[200px] bg-white text-gray-900 border border-gray-300 dark:bg-black/90 dark:text-white dark:border-white/10"
              >
                {allWarehouses.map(w => (
                  <option key={w.id} value={w.id} className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white">{w.facility_name} ({w.district})</option>
                ))}
              </select>
            </div>
          )}
          {user.role === 'admin' && (
            <Button
              variant="secondary"
              onClick={() => {
                setShowAdminUsersModal(true);
                void loadAdminUsers();
              }}
              icon={Users}
            >
              User Management
            </Button>
          )}
        </div>
      </div>
      
      {/* KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
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
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input 
                  type="text" 
                  placeholder="Search shipments..." 
                  value={activeShipmentsSearch}
                  onChange={(e) => { setActiveShipmentsSearch(e.target.value); setActiveShipmentsPage(1); }}
                  className="input-field py-1.5 text-sm w-full sm:w-[200px] bg-background/50"
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
              <div className="relative">
                <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <select 
                  value={activeShipmentsFilter}
                  onChange={(e) => { setActiveShipmentsFilter(e.target.value); setActiveShipmentsPage(1); }}
                  className="input-field py-1.5 text-sm w-full sm:w-auto bg-white text-gray-900 border border-gray-300 dark:bg-black/90 dark:text-white dark:border-white/10"
                  style={{ paddingLeft: '2.5rem' }}
                >
                  <option value="" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white">All Statuses</option>
                  <option value="In Transit" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white">In Transit</option>
                  <option value="In Storage" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white">In Storage</option>
                  <option value="Redirected" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white">Redirected</option>
                  <option value="Listed (Standard Mandi)" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white">Listed (Standard Mandi)</option>
                  <option value="Listed (Accelerated)" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white">Listed (Accelerated)</option>
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
                      <span>ETA: <span className="font-medium text-text-main">{shipment.status === 'Delivered' ? 'N/A' : (shipment.eta_hours ? Number.parseFloat(shipment.eta_hours).toFixed(1) + ' hrs' : '-')}</span></span>
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
              {displayNotifs.filter(n => !n.is_read).length > 0 ? (
                <div className="divide-y divide-glass-border">
                  {(user?.role === 'farmer' ? displayNotifs.filter(n => !n.is_read).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10) : displayNotifs.filter(n => !n.is_read).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5)).map(notif => (
                    <button 
                      type="button"
                      key={notif.id} 
                      className="w-full text-left p-4 bg-primary/5 hover:bg-primary/10 cursor-pointer transition-colors block"
                      onClick={() => openNotification(notif)}
                    >
                      <div className="flex justify-between items-start gap-2 mb-1">
                        <h4 className="font-semibold text-sm flex items-center gap-2">
                          {notif.type === 'dispatch_alert' && <AlertTriangle size={14} className="text-warning" />}
                          {notif.title}
                        </h4>
                      </div>
                      <p className="text-sm text-text-muted mb-2 line-clamp-1">{notif.message.split('\n')[0]}</p>
                      <span className="text-xs text-text-muted/50">
                        {new Date(notif.created_at).toLocaleString()}
                      </span>
                    </button>
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
                  className="input-field py-1 px-3 text-sm min-w-[120px] bg-white text-gray-900 border border-gray-300 dark:bg-black/90 dark:text-white dark:border-white/10"
                >
                  <option value="" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white">All Crops</option>
                  <option value="Tomato" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white">Tomato</option>
                  <option value="Onion" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white">Onion</option>
                  <option value="Potato" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white">Potato</option>
                  <option value="Cucumber" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-white">Cucumber</option>
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


      {/* ACTIVE SHIPMENT DETAILS MODAL */}
      <AnimatePresence>
        {selectedActiveShipment && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-x-0 bottom-0 top-[88px] z-40 flex items-center justify-center bg-white/20 dark:bg-black/40 backdrop-blur-md p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.95, opacity: 0, y: 20 }} 
              transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
              className="w-full max-w-2xl flex flex-col p-0 border border-white/60 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.1)] overflow-hidden rounded-3xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-2xl"
            >
            <div className="p-4 border-b border-white/30 dark:border-white/10 flex justify-between items-center bg-white/40 dark:bg-black/20">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 sm:gap-y-4 gap-x-6 text-sm">
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
                      <div><span className="text-text-muted">Est. Arrival:</span> <span className="font-medium">{Number.parseFloat(selectedActiveShipment.eta_hours).toFixed(1)} hrs</span></div>
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ADMIN USERS & PASSWORD RESET MODAL */}
      <AnimatePresence>
        {showAdminUsersModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.95, opacity: 0, y: 20 }} 
              transition={{ type: "spring", duration: 0.4 }}
              className="w-full max-w-3xl flex flex-col p-0 border border-glass-border shadow-2xl overflow-hidden rounded-2xl bg-white dark:bg-gray-900"
            >
              <div className="p-4 border-b border-glass-border flex justify-between items-center bg-gray-50 dark:bg-black/20">
                <div className="flex items-center gap-2">
                  <Users className="text-primary" size={22} />
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">User Management & Password Reset</h3>
                </div>
                <button 
                  onClick={() => { setShowAdminUsersModal(false); setResetTargetUser(null); setAdminNewPassword(''); }}
                  className="p-1 rounded-full text-text-muted hover:text-danger transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto max-h-[70vh] space-y-4">
                {adminUsersLoading ? (
                  <div className="py-8 text-center text-text-muted">Loading users...</div>
                ) : adminUsersList.length === 0 ? (
                  <div className="py-8 text-center text-text-muted">No users found.</div>
                ) : (
                  <div className="divide-y divide-glass-border border border-glass-border rounded-xl overflow-hidden">
                    {adminUsersList.map((u) => (
                      <div key={u.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-text-main">{u.full_name}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full uppercase font-medium bg-primary/10 text-primary border border-primary/20">
                              {u.role}
                            </span>
                            {u.id === user.id && (
                              <span className="text-xs text-text-muted">(You)</span>
                            )}
                          </div>
                          <div className="text-xs text-text-muted mt-1 space-x-3">
                            <span>Email: {u.email}</span>
                            <span>Phone: {u.phone}</span>
                            {u.district && <span>District: {u.district}</span>}
                          </div>
                        </div>

                        {u.id !== user.id && (
                          <div>
                            {resetTargetUser?.id === u.id ? (
                              <form onSubmit={handleAdminResetPassword} className="flex items-center gap-2 mt-2 sm:mt-0">
                                <input
                                  type="password"
                                  placeholder="New password (min 6)"
                                  minLength="6"
                                  value={adminNewPassword}
                                  onChange={(e) => setAdminNewPassword(e.target.value)}
                                  className="input-field py-1 px-2.5 text-xs w-44"
                                  required
                                />
                                <Button type="submit" className="!py-1 !px-2.5 !text-xs" disabled={adminResetSubmitting}>
                                  {adminResetSubmitting ? 'Saving...' : 'Save'}
                                </Button>
                                <Button 
                                  type="button" 
                                  variant="secondary" 
                                  className="!py-1 !px-2.5 !text-xs"
                                  onClick={() => { setResetTargetUser(null); setAdminNewPassword(''); }}
                                >
                                  Cancel
                                </Button>
                              </form>
                            ) : (
                              <Button
                                variant="secondary"
                                className="!py-1 !px-3 !text-xs flex items-center gap-1.5"
                                onClick={() => { setResetTargetUser(u); setAdminNewPassword(''); }}
                              >
                                <Key size={14} /> Reset Password
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-glass-border bg-gray-50 dark:bg-black/20 flex justify-end">
                <Button 
                  onClick={() => { setShowAdminUsersModal(false); setResetTargetUser(null); setAdminNewPassword(''); }}
                  variant="secondary"
                  className="!py-1.5 !px-4 text-sm"
                >
                  Close
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default Dashboard;
