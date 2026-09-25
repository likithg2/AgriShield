import React, { useState, useEffect, useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import GlassCard from '../components/GlassCard';
import Button from '../components/Button';
import { warehousesAPI, shipmentsAPI } from '../utils/api';
import { Search, Filter, Download, Truck, X, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const WarehouseLogs = () => {
  const { user, selectedAdminWarehouseId } = useContext(AuthContext);
  const [allShipments, setAllShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  const getCropEmoji = (crop) => {
    const lower = (crop || '').toLowerCase();
    if (lower.includes('tomato')) return '🍅';
    if (lower.includes('onion')) return '🧅';
    if (lower.includes('potato')) return '🥔';
    if (lower.includes('carrot')) return '🥕';
    if (lower.includes('apple')) return '🍎';
    if (lower.includes('mango')) return '🥭';
    return '🌱';
  };

  useEffect(() => {
    if (user && (user.role === 'warehouse_manager' || user.role === 'admin')) {
      const loadData = async () => {
        try {
          const whRes = await warehousesAPI.list();
          let wh;
          if (user.role === 'admin') {
            wh = selectedAdminWarehouseId 
              ? whRes.data.find(w => w.id === selectedAdminWarehouseId)
              : (whRes.data.length > 0 ? whRes.data[0] : null);
          } else {
            wh = whRes.data.find(w => w.id === user.managed_warehouse_id);
          }
          if (wh) {
            const shipRes = await shipmentsAPI.list();
            setAllShipments(shipRes.data.filter(s => s.destination === wh.facility_name));
          }
        } catch (err) {
          console.error("Failed to load logs", err);
        } finally {
          setLoading(false);
        }
      };
      loadData();
    }
  }, [user, selectedAdminWarehouseId]);

  if (!user) return <Navigate to="/login" />;
  if (user.role !== 'warehouse_manager' && user.role !== 'admin') return <Navigate to="/dashboard" />;

  const filteredShipments = allShipments.filter(s => {
    const matchesSearch = (s.booking_id?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                          (s.farmer_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                          (s.vehicle_reg_number?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                          (s.crop?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter ? s.status === statusFilter : true;
    return matchesSearch && matchesStatus;
  });

  const downloadCSV = () => {
    const headers = [
      'Date Logged', 'Booking ID', 'Farmer Name', 'Farmer Phone', 'Vehicle Reg', 
      'Crop', 'Qty (t)', 'Est. Shelf Life', 'Risk Level', 'Current Status', 
      'Origin', 'Destination', 'Distance (km)', 'Est. Arrival (hrs)', 
      'Predicted Vol Loss (%)', 'Predicted Fin Loss (₹)', 'Mandi Price (₹/kg)', 'Last Updated'
    ];
    
    const rows = filteredShipments.map(s => [
      s.created_at ? new Date(s.created_at).toLocaleString() : '-',
      s.booking_id,
      s.farmer_name || 'Unknown',
      s.farmer_phone || 'N/A',
      s.vehicle_reg_number || 'N/A',
      s.crop,
      s.tonnage,
      s.shelf_days_calculated ? s.shelf_days_calculated.toFixed(1) + ' days' : '-',
      s.risk_status || 'UNKNOWN',
      s.status,
      s.prediction?.district || '-',
      s.destination || '-',
      s.distance_km || '-',
      s.eta_hours ? parseFloat(s.eta_hours).toFixed(1) : '-',
      s.prediction?.loss_percentage || '-',
      s.prediction?.financial_loss ? Math.round(s.prediction.financial_loss) : '-',
      s.prediction?.mandi_price_per_kg || '-',
      s.updated_at ? new Date(s.updated_at).toLocaleString() : '-'
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `warehouse_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full px-4 sm:px-[2cm] py-8">
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">📚 Shipment Logs & History</h2>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input 
                type="text" 
                placeholder="Search logs..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field py-1.5 text-sm w-[250px] bg-background/50"
                style={{ paddingLeft: '2.5rem' }}
              />
            </div>
            <div className="relative">
              <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input-field py-1.5 text-sm bg-background/50 dark:bg-black/90 dark:text-white appearance-none"
                style={{ paddingLeft: '2.5rem' }}
              >
                <option value="">All Statuses</option>
                <option value="In Transit">In Transit</option>
                <option value="In Storage">In Storage</option>
                <option value="Delivered">Delivered</option>
                <option value="Redirected">Redirected</option>
                <option value="Listed (Standard Mandi)">Listed (Standard Mandi)</option>
                <option value="Listed (Accelerated)">Listed (Accelerated)</option>
              </select>
            </div>
            <Button onClick={downloadCSV} variant="secondary" className="!py-1.5 text-sm" icon={Download}>
              Export CSV
            </Button>
          </div>
        </div>
        
        {loading ? (
          <GlassCard className="p-6 text-center text-text-muted">Loading logs...</GlassCard>
        ) : (
          <GlassCard className="p-4 overflow-x-auto">
            {allShipments.length > 0 ? (
              <table className="w-full text-left text-sm border-collapse whitespace-nowrap">
                <thead>
                  <tr className="border-b border-glass-border text-text-muted">
                    <th className="py-3 pr-4">Date Logged</th>
                    <th className="py-3 pr-4">Booking ID</th>
                    <th className="py-3 pr-4">Farmer Details</th>
                    <th className="py-3 pr-4">Vehicle Reg</th>
                    <th className="py-3 pr-4">Crop</th>
                    <th className="py-3 pr-4">Qty (t)</th>
                    <th className="py-3 pr-4">Est. Shelf Life</th>
                    <th className="py-3 pr-4">Current Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...filteredShipments].sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).map(s => (
                    <tr key={s.id} onClick={() => setSelectedLog(s)} className="border-b border-glass-border/30 hover:bg-white/10 transition-colors cursor-pointer">
                      <td className="py-3 pr-4">{s.created_at ? new Date(s.created_at).toLocaleString() : '-'}</td>
                      <td className="py-3 pr-4 font-mono font-medium">{s.booking_id}</td>
                      <td className="py-3 pr-4">
                        <div>{s.farmer_name || 'Unknown'}</div>
                        <div className="text-xs text-text-muted">{s.farmer_phone || 'N/A'}</div>
                      </td>
                      <td className="py-3 pr-4">{s.vehicle_reg_number || 'N/A'}</td>
                      <td className="py-3 pr-4">{s.crop}</td>
                      <td className="py-3 pr-4">{s.tonnage}</td>
                      <td className="py-3 pr-4">{s.shelf_days_calculated ? s.shelf_days_calculated.toFixed(1) + ' days' : '-'}</td>
                      <td className="py-3 pr-4">
                        <span className="px-2 py-1 rounded bg-background/50 border border-glass-border text-xs">
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="text-center py-10 text-text-muted text-lg">No history logs available.</div>}
          </GlassCard>
        )}

        <AnimatePresence>
          {selectedLog && (
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
                  <Truck size={20} className="text-primary" /> Shipment #{selectedLog.booking_id}
                </h2>
                <button 
                  onClick={() => setSelectedLog(null)}
                  className="p-1 rounded-full hover:bg-white/10 text-text-muted hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto max-h-[70vh]">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-2xl font-bold flex items-center gap-2 mb-1">
                      {getCropEmoji(selectedLog.crop)} {selectedLog.crop}
                    </h3>
                    <div className="text-sm text-text-muted">
                      Created: {new Date(selectedLog.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="px-4 py-1.5 bg-primary/20 text-primary border border-primary/30 rounded-full font-bold text-sm tracking-wider uppercase">
                    {selectedLog.status.replace('_', ' ')}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-white/50 dark:bg-white/5 p-3 rounded-xl border border-white/40 shadow-sm backdrop-blur-md">
                    <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">Quantity</div>
                    <div className="font-bold text-lg text-text-main">{selectedLog.tonnage} Tons</div>
                  </div>
                  <div className="bg-white/50 dark:bg-white/5 p-3 rounded-xl border border-white/40 shadow-sm backdrop-blur-md">
                    <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">Risk Level</div>
                    <div className={`font-bold text-lg ${
                      (selectedLog.risk_status || '').toLowerCase() === 'high' ? 'text-danger' : 
                      (selectedLog.risk_status || '').toLowerCase() === 'medium' ? 'text-warning' : 'text-success'
                    }`}>{selectedLog.risk_status || 'LOW'}</div>
                  </div>
                  <div className="bg-white/50 dark:bg-white/5 p-3 rounded-xl border border-white/40 shadow-sm backdrop-blur-md">
                    <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">Shelf Life</div>
                    <div className="font-bold text-lg text-text-main">{selectedLog.shelf_days_calculated ? `${selectedLog.shelf_days_calculated.toFixed(1)} days` : '-'}</div>
                  </div>
                  <div className="bg-white/50 dark:bg-white/5 p-3 rounded-xl border border-white/40 shadow-sm backdrop-blur-md">
                    <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">Vehicle Reg</div>
                    <div className="font-bold text-lg text-text-main">{selectedLog.vehicle_reg_number || 'N/A'}</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="border border-white/40 rounded-xl p-5 bg-white/40 dark:bg-white/5 shadow-sm backdrop-blur-md">
                    <h3 className="font-semibold text-primary mb-3 text-lg flex items-center gap-2">
                      <User size={18} /> Farmer & Update Info
                    </h3>
                    <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
                      <div><span className="text-text-muted">Farmer Name:</span> <span className="font-medium">{selectedLog.farmer_name || 'Unknown'}</span></div>
                      <div><span className="text-text-muted">Phone:</span> <span className="font-medium">{selectedLog.farmer_phone || 'N/A'}</span></div>
                      <div className="col-span-2"><span className="text-text-muted">Last Updated:</span> <span className="font-medium">{selectedLog.updated_at ? new Date(selectedLog.updated_at).toLocaleString() : '-'}</span></div>
                    </div>
                  </div>

                  <div className="border border-white/40 rounded-xl p-5 bg-white/40 dark:bg-white/5 shadow-sm backdrop-blur-md">
                    <h3 className="font-semibold text-primary mb-3 text-lg flex items-center gap-2">
                      <Truck size={18} /> Logistics Route
                    </h3>
                    <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
                      {selectedLog.prediction?.district && (
                        <div><span className="text-text-muted">Origin:</span> <span className="font-medium">{selectedLog.prediction.district}</span></div>
                      )}
                      {selectedLog.destination && (
                        <div><span className="text-text-muted">Destination:</span> <span className="font-medium">{selectedLog.destination}</span></div>
                      )}
                      {selectedLog.distance_km != null && selectedLog.distance_km !== '' && (
                        <div><span className="text-text-muted">Distance:</span> <span className="font-medium">{selectedLog.distance_km} km</span></div>
                      )}
                      {selectedLog.eta_hours != null && selectedLog.eta_hours !== '' && (
                        <div><span className="text-text-muted">Est. Arrival:</span> <span className="font-medium">{parseFloat(selectedLog.eta_hours).toFixed(1)} hrs</span></div>
                      )}
                    </div>
                  </div>
                  
                  {selectedLog.prediction && (
                    <div className="border border-white/40 rounded-xl p-5 bg-white/40 dark:bg-white/5 shadow-sm backdrop-blur-md mt-4">
                      <h3 className="font-semibold text-secondary mb-3 text-lg">Predicted Loss Metrics</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 text-sm">
                        <div><span className="text-text-muted">Vol. Loss:</span> <span className="font-bold text-lg ml-1">{selectedLog.prediction.loss_percentage}%</span></div>
                        <div><span className="text-text-muted">Fin. Loss:</span> <span className="font-bold text-lg text-red-400 ml-1">~ ₹{Math.round(selectedLog.prediction.financial_loss).toLocaleString()}</span></div>
                        <div><span className="text-text-muted">Mandi Price:</span> <span className="font-bold text-lg ml-1">₹{selectedLog.prediction.mandi_price_per_kg}/kg</span></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="p-4 border-t border-white/30 bg-white/40 dark:bg-black/40 flex justify-end">
                <Button onClick={() => setSelectedLog(null)} variant="primary" className="!py-2 !px-6">
                  Close
                </Button>
              </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default WarehouseLogs;
