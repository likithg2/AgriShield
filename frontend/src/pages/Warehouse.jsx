import React, { useState, useEffect, useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { shipmentsAPI, warehousesAPI } from '../utils/api';
import GlassCard from '../components/GlassCard';
import Button from '../components/Button';
import { Package, Truck, ShieldAlert, AlertTriangle, Settings, CheckCircle, Save, Calendar, Search, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

const Warehouse = () => {
  const { user, selectedAdminWarehouseId, setAdminWarehouse } = useContext(AuthContext);
  const [allShipments, setAllShipments] = useState([]);
  const [warehouse, setWarehouse] = useState(null);
  const [allWarehouses, setAllWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  // Configuration State
  const [simulateFault, setSimulateFault] = useState(false);
  const [capacityConfig, setCapacityConfig] = useState({
    occupancy_pct: 0,
    price_per_ton_day: 0,
    capacity_mt: 0
  });

  // Inspection Form State
  const [inspectVid, setInspectVid] = useState('');
  const [inspectDate, setInspectDate] = useState(new Date().toISOString().split('T')[0]);
  const [inspectTemp, setInspectTemp] = useState(10.0);
  const [inspectBruising, setInspectBruising] = useState('None');
  const [inspectRipeness, setInspectRipeness] = useState('Optimal Balance');
  
  // Industrial Buyers Mock
  const industrialBuyers = [
    { buyer_name: "ITC Agro (Davanagere Hub)", target_crop: "Hybrid Tomato", processing_type: "Tomato Paste & Ketchup Base" },
    { buyer_name: "Kisan Food Processing (Mysore)", target_crop: "Capsicum (Green)", processing_type: "Dehydrated Spices / Pickling" },
    { buyer_name: "Regional Agro-Processing Cooperative Hub", target_crop: "Onion", processing_type: "Standard Food Preservation & Salvage Lines" }
  ];

  const [marketShipmentsPage, setMarketShipmentsPage] = useState(1);
  const [crossConnectPage, setCrossConnectPage] = useState(1);
  const [crossConnectSearch, setCrossConnectSearch] = useState('');
  const [dispatchConfirm, setDispatchConfirm] = useState({ show: false, shipmentId: null, action: null });
  const [inspectConfirm, setInspectConfirm] = useState(false);
  const [configConfirm, setConfigConfirm] = useState(false);

  useEffect(() => {
    if (user && (user.role === 'warehouse_manager' || user.role === 'admin')) {
      const loadData = async () => {
        try {
          const whRes = await warehousesAPI.list();
          let wh = null;
          
          if (user.role === 'admin') {
            setAllWarehouses(whRes.data);
            if (selectedAdminWarehouseId) {
              wh = whRes.data.find(w => w.id === selectedAdminWarehouseId);
            }
            if (!wh && whRes.data.length > 0) {
              wh = whRes.data[0];
              setAdminWarehouse(wh.id);
            }
          } else {
            wh = whRes.data.find(w => w.id === user.managed_warehouse_id);
          }
          
          if (wh) {
            setWarehouse(wh);
            setCapacityConfig({
              occupancy_pct: wh.occupancy_pct || 0,
              price_per_ton_day: wh.price_per_ton_day || 0,
              capacity_mt: wh.capacity_mt || 5000
            });
            setSimulateFault(wh.base_temp_c > 10.0);
            
            const shipRes = await shipmentsAPI.list();
            setAllShipments(shipRes.data.filter(s => s.destination === wh.facility_name));
          }
        } catch (err) {
          console.error("Failed to load warehouse data", err);
        } finally {
          setLoading(false);
        }
      };
      loadData();
    }
  }, [user, selectedAdminWarehouseId]);

  if (!user) return <Navigate to="/login" />;
  if (user.role !== 'warehouse_manager' && user.role !== 'admin') return <Navigate to="/dashboard" />;

  // Computed data
  const activeShipments = allShipments.filter(s => s.status === 'In Transit' || s.status === 'Delivered');
  const inventory = allShipments.filter(s => 
    s.status === 'In Storage'
  ).map(s => {
    let baseShelfDays = s.shelf_days_calculated || 0;
    if (s.created_at) {
      const createdDate = new Date(s.created_at);
      const daysElapsed = (currentTime - createdDate.getTime()) / (1000 * 60 * 60 * 24);
      baseShelfDays = Math.max(0, baseShelfDays - daysElapsed);
    }
    let hr = baseShelfDays * 24.0;
    
    if (simulateFault) {
      hr = hr / 2.8;
    }
    
    // Automatically update risk status based on dynamic hours remaining
    const daysLeft = hr / 24.0;
    let effectiveRisk = 'LOW';
    if (daysLeft < 2) effectiveRisk = 'HIGH';
    else if (daysLeft < 5) effectiveRisk = 'MEDIUM';
    
    if (simulateFault && hr < 48) {
      effectiveRisk = 'HIGH (TEMP FAULT)';
    }

    return { ...s, computed_hours_remaining: hr, risk_status: effectiveRisk };
  }).sort((a, b) => {
    const riskVal = (r) => (r || '').includes('HIGH') ? 0 : (r || '').includes('MEDIUM') ? 1 : 2;
    if (riskVal(a.risk_status) !== riskVal(b.risk_status)) return riskVal(a.risk_status) - riskVal(b.risk_status);
    return a.computed_hours_remaining - b.computed_hours_remaining;
  });
  const marketShipments = allShipments.filter(s => strStartsWith(s.status, 'Listed') || s.status === 'Awaiting Buyer Pickup Confirmation' || s.status === 'Redirected');
  
  function strStartsWith(str, prefix) {
    return str && str.toString().startsWith(prefix);
  }

  // Action Handlers
  const promptConfigSave = () => {
    setConfigConfirm(true);
  };

  const confirmConfigSave = async () => {
    setConfigConfirm(false);
    try {
      await warehousesAPI.update(warehouse.id, {
        occupancy_pct: parseFloat(capacityConfig.occupancy_pct),
        price_per_ton_day: parseFloat(capacityConfig.price_per_ton_day),
        capacity_mt: parseInt(capacityConfig.capacity_mt),
        base_temp_c: simulateFault ? 14.5 : 4.0
      });
      toast.success(`Successfully updated metrics for ${warehouse.facility_name}`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to save configuration");
    }
  };

  const handleSimulateFault = async () => {
    const newFault = !simulateFault;
    setSimulateFault(newFault);
    try {
      await warehousesAPI.update(warehouse.id, { base_temp_c: newFault ? 14.5 : 4.0 });
      setWarehouse(prev => ({...prev, base_temp_c: newFault ? 14.5 : 4.0}));
    } catch(e) {
      console.error(e);
      setSimulateFault(!newFault);
    }
  };

  const promptInspect = () => {
    if (!inspectVid) return toast.error("Select a vehicle to inspect.");
    setInspectConfirm(true);
  };

  const confirmInspect = async () => {
    setInspectConfirm(false);
    try {
      await warehousesAPI.inspectShipment(warehouse.id, {
        shipment_booking_id: inspectVid,
        bruising: inspectBruising,
        ripeness: inspectRipeness,
        core_temp: parseFloat(inspectTemp)
      });
      toast.success(`Inspection logged. Vehicle ${inspectVid} docked successfully.`);
      setInspectVid('');
      const shipRes = await shipmentsAPI.list();
      setAllShipments(shipRes.data.filter(s => s.destination === warehouse.facility_name));
    } catch (e) {
      console.error(e);
      toast.error("Failed to log inspection.");
    }
  };

  const promptDispatch = (shipmentId, action) => {
    setDispatchConfirm({ show: true, shipmentId, action });
  };

  const confirmDispatch = async () => {
    const { shipmentId, action } = dispatchConfirm;
    setDispatchConfirm({ show: false, shipmentId: null, action: null });
    try {
      await warehousesAPI.dispatchShipment(warehouse.id, shipmentId, action);
      toast.success(`Dispatch triggered: ${action}`);
      const shipRes = await shipmentsAPI.list();
      setAllShipments(shipRes.data.filter(s => s.destination === warehouse.facility_name));
    } catch(e) {
      console.error(e);
      toast.error("Failed to dispatch shipment.");
    }
  };

  if (loading) return <div className="p-8 text-center">Loading Warehouse Portal...</div>;

  const activeMarketShipments = allShipments.filter(s => ['Listed (Standard Mandi)', 'Listed (Accelerated)', 'Awaiting Buyer Pickup Confirmation', 'Redirected'].includes(s.status));
  const ITEMS_PER_PAGE = 10;
  const totalMarketPages = Math.ceil(activeMarketShipments.length / ITEMS_PER_PAGE);
  const currentMarketShipments = activeMarketShipments.slice((marketShipmentsPage - 1) * ITEMS_PER_PAGE, marketShipmentsPage * ITEMS_PER_PAGE);

  const filteredWarehouses = allWarehouses.filter(w => 
    w.facility_name.toLowerCase().includes(crossConnectSearch.toLowerCase()) || 
    w.district.toLowerCase().includes(crossConnectSearch.toLowerCase())
  );
  const CROSS_CONNECT_ITEMS_PER_PAGE = 20;
  const totalCrossConnectPages = Math.ceil(filteredWarehouses.length / CROSS_CONNECT_ITEMS_PER_PAGE);
  const currentCrossConnectWarehouses = filteredWarehouses.slice(
    (crossConnectPage - 1) * CROSS_CONNECT_ITEMS_PER_PAGE,
    crossConnectPage * CROSS_CONNECT_ITEMS_PER_PAGE
  );

  return (
    <div className="space-y-4 pb-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Package className="text-primary" size={32} /> Cold Storage & Operations Portal
          </h1>
          <p className="text-text-muted mt-1">BaaS Administrative Control Unit</p>
        </div>
        
        {user.role === 'admin' && allWarehouses.length > 0 ? (
          <div className="flex items-center gap-3 bg-white/40 dark:bg-black/20 px-4 py-2 rounded-xl border border-glass-border">
            <span className="text-sm font-medium text-text-muted">Managing Node:</span>
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
        ) : (
          <div className="bg-primary/10 text-primary px-4 py-2 rounded-xl font-medium border border-primary/20">
            🏢 Assigned Node: {warehouse?.facility_name}
          </div>
        )}
      </div>
      
      <div className="h-px bg-glass-border w-full"></div>

      {/* COLD CHAIN FAULT MONITOR */}
      <div className="space-y-3">
        <h2 className="text-xl font-bold flex items-center gap-2"><Settings className="text-primary"/> 🚨 Cold Chain Temperature Monitor</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <GlassCard className="col-span-1 p-4">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
              ⚡ Temperature Controller
            </h3>
            <div className="flex items-center justify-between p-4 bg-background/50 rounded-xl border border-white/5">
              <span className="font-semibold text-sm">Simulate Cooling Plant Malfunction</span>
              <button 
                onClick={handleSimulateFault}
                className={`w-12 h-6 rounded-full relative transition-colors ${simulateFault ? 'bg-danger' : 'bg-gray-600'}`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${simulateFault ? 'left-7' : 'left-1'}`}></div>
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between px-2">
              <span className="text-sm font-medium text-text-muted">Freezer Status:</span>
              <span className={`px-3 py-1 rounded-md text-xs font-bold uppercase ${simulateFault ? 'bg-danger/20 text-danger border border-danger/30' : 'bg-green-500/20 text-green-500 border border-green-500/30'}`}>
                {simulateFault ? 'Malfunctioned' : 'Normal'}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-3">Simulates a localized HVAC compressor trip, spiking internal storage temps.</p>
          </GlassCard>
          
          <GlassCard className="col-span-1 lg:col-span-2 p-4 flex flex-col justify-center">
            {simulateFault ? (
              <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 flex gap-4 items-start">
                <AlertTriangle className="text-danger shrink-0" size={32} />
                <div>
                  <h4 className="text-danger font-bold text-lg mb-1">⚠️ CRITICAL ALERT: Warehouse Cooling Failure Detected</h4>
                  <p className="text-sm text-text-muted leading-relaxed">
                    Internal storage room temperatures have drifted from 4.0°C up to <span className="font-bold text-text">14.5°C</span>.
                    According to the biophysical <span className="font-bold text-text">Q10 Respiration Formula</span>, crop decay rates have accelerated by <span className="font-bold text-text">2.8x</span>.
                    The system has put an emergency holding block on incoming perishable loads to prevent immediate rot.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-success/10 border border-success/30 rounded-xl p-4 flex gap-4 items-center">
                <CheckCircle className="text-green-400 shrink-0" size={32} />
                <p className="text-green-400 font-medium">✅ Refrigeration systems operating normally. Storage vault temperature stable at a safe 4.0°C baseline.</p>
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      <div className="h-px bg-glass-border w-full"></div>

      {/* SECTION 1: CAPACITY & ACTIVE SHIPMENTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CAPACITY CONFIGURATION */}
        <div className="space-y-3">
          <h2 className="text-xl font-bold flex items-center gap-2">🏢 Facility Capacity & Rental Configuration</h2>
          <GlassCard className="p-4 h-[520px] flex flex-col justify-between">
            <div className="mb-3 text-sm text-text-muted">
              <strong>District Location:</strong> {warehouse?.district} | <strong>GPS:</strong> {warehouse?.latitude?.toFixed(4)}, {warehouse?.longitude?.toFixed(4)}
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Total Storage Quantity (Tons)</label>
                <div className="input-field bg-background/50 cursor-not-allowed text-text-muted">{capacityConfig.capacity_mt}</div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Live Warehouse Storage Space Filled ({capacityConfig.occupancy_pct}%)</label>
                <input type="range" className="w-full accent-primary" min="0" max="100" step="0.1" value={capacityConfig.occupancy_pct} onChange={e => setCapacityConfig({...capacityConfig, occupancy_pct: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Storage Rent Price (₹ / Ton / Day)</label>
                <input type="number" className="input-field" value={capacityConfig.price_per_ton_day} onChange={e => setCapacityConfig({...capacityConfig, price_per_ton_day: e.target.value})} />
              </div>
              
              <div className="bg-primary/10 text-primary p-3 rounded-lg text-sm font-medium">
                Actual Storage Quantity Filled: {(capacityConfig.capacity_mt * (capacityConfig.occupancy_pct/100)).toFixed(1)} Tons
              </div>
              
              {capacityConfig.occupancy_pct >= 95 && (
                <div className="bg-danger/10 text-danger p-3 rounded-lg text-sm font-bold">
                  🔴 WAREHOUSE CAPACITY FULL: Farmers cannot route new crop dispatches here until space clears up.
                </div>
              )}
              {capacityConfig.occupancy_pct >= 75 && capacityConfig.occupancy_pct < 95 && (
                <div className="bg-warning/10 text-warning p-3 rounded-lg text-sm font-bold">
                  🟡 HIGH OCCUPANCY NOTICE: Storage space filling up fast. Consider adjusting rental pricing buffers.
                </div>
              )}
              
              <Button onClick={promptConfigSave} className="w-full justify-center" icon={Save}>
                COMMIT WAREHOUSE MATRIX TO DATABASE
              </Button>
            </div>
          </GlassCard>
        </div>
        
        {/* ACTIVE SHIPMENTS */}
        <div className="space-y-3">
          <h2 className="text-xl font-bold flex items-center gap-2">🚚 Active Shipments (Market & Factory)</h2>
          <GlassCard className="p-4 h-[520px] flex flex-col">
            {activeMarketShipments.length > 0 ? (
              <>
                <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-glass-border">
                        <th className="py-2 pr-4 font-bold text-text-muted">Vehicle ID</th>
                        <th className="py-2 pr-4 font-bold text-text-muted">Crop</th>
                        <th className="py-2 pr-4 font-bold text-text-muted">Tons</th>
                        <th className="py-2 pr-4 font-bold text-text-muted">Risk</th>
                        <th className="py-2 pr-4 font-bold text-text-muted">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentMarketShipments.map(s => (
                        <tr key={s.id} className="border-b border-glass-border/30 hover:bg-white/5 transition-colors">
                          <td className="py-3 pr-4 font-medium">
                            {s.booking_id}
                            {s.vehicle_reg_number && <><br/><span className="text-xs text-text-muted">{s.vehicle_reg_number}</span></>}
                          </td>
                          <td className="py-3 pr-4">{s.crop}</td>
                          <td className="py-3 pr-4">{s.tonnage}</td>
                          <td className="py-3 pr-4">
                            <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                              (s.risk_status||'').includes('HIGH') ? 'bg-danger/10 text-danger' :
                              (s.risk_status||'').includes('MEDIUM') ? 'bg-warning/10 text-warning' :
                              'bg-success/10 text-success'
                            }`}>
                              {s.risk_status}
                            </span>
                          </td>
                          <td className="py-3 pr-4">{s.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalMarketPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-glass-border text-sm">
                    <span className="text-text-muted">
                      Showing {(marketShipmentsPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(marketShipmentsPage * ITEMS_PER_PAGE, activeMarketShipments.length)} of {activeMarketShipments.length}
                    </span>
                    <div className="flex gap-2">
                      <Button 
                        onClick={() => setMarketShipmentsPage(p => Math.max(1, p - 1))}
                        disabled={marketShipmentsPage === 1}
                        variant="secondary"
                        className="!py-1 !px-3 !min-h-0 text-sm"
                      >
                        Prev
                      </Button>
                      <Button 
                        onClick={() => setMarketShipmentsPage(p => Math.min(totalMarketPages, p + 1))}
                        disabled={marketShipmentsPage === totalMarketPages}
                        variant="secondary"
                        className="!py-1 !px-3 !min-h-0 text-sm"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center p-6 bg-background/50 rounded-xl border border-glass-border text-text-muted my-auto">
                No active shipments in the market.
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      <div className="h-px bg-glass-border w-full my-6"></div>



      {/* SECTION 2: QUEUE & QUALITY GATE */}
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-6">
        {/* QUEUE */}
        <div className="space-y-3 lg:col-span-4">
          <h2 className="text-xl font-bold flex items-center gap-2">🚚 Arriving Farmer Vehicles Queue</h2>
          <GlassCard className="p-4 h-[500px] flex flex-col">
            {activeShipments.length > 0 ? (
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
                <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-glass-border text-text-muted">
                    <th className="py-2 pr-4">Vehicle ID</th>
                    <th className="py-2 pr-4">Crop</th>
                    <th className="py-2 pr-4">Weight</th>
                    <th className="py-2 pr-4">Road Condition</th>
                    <th className="py-2 pr-4">ETA (hrs)</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">AI Risk Level</th>
                  </tr>
                </thead>
                <tbody>
                  {activeShipments.map(s => (
                    <tr key={s.id} className="border-b border-glass-border/30 hover:bg-white/5 transition-colors">
                      <td className="py-3 pr-4 font-medium">
                        {s.booking_id}
                        {s.vehicle_reg_number && <><br/><span className="text-xs text-text-muted">Vehicle: {s.vehicle_reg_number}</span></>}
                      </td>
                      <td className="py-3 pr-4">{s.crop}</td>
                      <td className="py-3 pr-4">{s.tonnage} t</td>
                      <td className="py-3 pr-4">{s.route_quality}</td>
                      <td className="py-3 pr-4">{s.status === 'Delivered' ? 'N/A' : (s.eta_hours ? parseFloat(s.eta_hours).toFixed(1) : '-')}</td>
                      <td className="py-3 pr-4 font-bold capitalize">
                        {s.status === 'Delivered' ? <span className="text-success">Reached</span> : <span className="text-primary">In Transit</span>}
                      </td>
                      <td className="py-3 pr-4">
                        {simulateFault ? (
                          <span className="px-2 py-1 rounded-full text-xs font-bold bg-danger/20 text-danger animate-pulse">
                            CRITICAL RISK (TEMP FAULT)
                          </span>
                        ) : (
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                            (s.risk_status||'').includes('HIGH') ? 'bg-danger/20 text-danger' : 
                            (s.risk_status||'').includes('MEDIUM') ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'
                          }`}>
                            {s.risk_status}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            ) : (
              <div className="text-center py-6 text-text-muted my-auto">ℹ️ No active farmer vehicles are currently traveling toward {warehouse?.facility_name}.</div>
            )}
          </GlassCard>
        </div>

        {/* QUALITY GATE ARRIVAL INSPECTION */}
        <div className="space-y-3 lg:col-span-3">
          <h2 className="text-xl font-bold flex items-center gap-2">🔬 Quality Gate Arrival Inspection</h2>
          <GlassCard className="p-4 h-[500px] flex flex-col justify-between">
            {activeShipments.length > 0 ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Select Arrived Vehicle</label>
                  <select  className="input-field dark:bg-black/90 dark:text-white" value={inspectVid} onChange={(e) => setInspectVid(e.target.value)}>
                    <option value="">-- Select Vehicle --</option>
                    {activeShipments.map(s => <option key={s.id} value={s.booking_id}>{s.booking_id} ({s.crop})</option>)}
                  </select>
                </div>
                
                {inspectVid && (() => {
                  const s = activeShipments.find(x => x.booking_id === inspectVid);
                  return (
                    <div className="bg-background/50 p-3 rounded-lg text-sm border border-glass-border">
                      <strong>Declared Crop:</strong> {s?.crop} | <strong>Declared Weight:</strong> {s?.tonnage} Tons
                    </div>
                  );
                })()}

                <div>
                  <label className="block text-sm font-medium mb-1">Actual Arrival Date</label>
                  <input type="date" className="input-field" value={inspectDate} onChange={(e) => setInspectDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Sensor Recorded Transit Temp (°C)</label>
                  <input type="number" step="0.1" className="input-field" value={inspectTemp} onChange={(e) => setInspectTemp(e.target.value)} />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Bruising Assessment</label>
                    <select  className="input-field dark:bg-black/90 dark:text-white" value={inspectBruising} onChange={e => setInspectBruising(e.target.value)}>
                      <option>None</option><option>Slight</option><option>Severe</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Ripeness Stage</label>
                    <select  className="input-field dark:bg-black/90 dark:text-white" value={inspectRipeness} onChange={e => setInspectRipeness(e.target.value)}>
                      <option>Unripe</option><option>Optimal Balance</option><option>Overripe / Soft</option>
                    </select>
                  </div>
                </div>

                <Button onClick={promptInspect} className="w-full justify-center">
                  ✅ Log Inspection & Accept to Vault
                </Button>
              </div>
            ) : (
              <div className="text-center py-8 text-warning">No vehicles available for inspection.</div>
            )}
          </GlassCard>
        </div>
      </div>

      {/* SPOILAGE RISK MANAGEMENT */}
      <div className="space-y-3">
        <h2 className="text-xl font-bold flex items-center gap-2">⏳ Spoilage Risk Management & Dispatch</h2>
        {inventory.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {inventory.map(s => {
              const riskLevel = (s.risk_status || '').toUpperCase();
              const isHigh = riskLevel.includes('HIGH');
              const isMed = riskLevel.includes('MEDIUM');
              
              const colors = isHigh ? { bg: 'bg-danger/10', border: 'border-danger/30', text: 'text-danger' } :
                             isMed  ? { bg: 'bg-warning/10', border: 'border-warning/30', text: 'text-warning' } :
                                      { bg: 'bg-success/10', border: 'border-success/30', text: 'text-success' };

              return (
                <GlassCard key={s.id} className={`p-4 flex flex-col ${colors.bg} border-l-4 ${colors.border} transition-transform hover:-translate-y-1`}>
                  <div className="flex justify-between items-center mb-3 pb-3 border-b border-glass-border">
                    <div className="flex items-center gap-2">
                      <span className="bg-white/50 dark:bg-black/50 px-2 py-1 rounded text-sm font-bold">📦 #{s.booking_id}</span>
                      {s.vehicle_reg_number && (
                        <span className="bg-white/50 dark:bg-black/50 px-2 py-1 rounded text-xs font-mono text-text-muted">Vehicle: {s.vehicle_reg_number}</span>
                      )}
                      <span className={`text-xs px-2 py-1 rounded-full font-bold bg-white/50 dark:bg-black/50 ${colors.text}`}>{s.risk_status}</span>
                    </div>
                    <div className={`font-bold ${colors.text} flex items-center gap-1`}>
                      <Clock size={16}/> {
                        (() => {
                          const h = Math.max(0, s.computed_hours_remaining);
                          const days = Math.floor(h / 24);
                          const hours = Math.round(h % 24);
                          if (days === 0) return `${hours}h`;
                          return `${days}d ${hours}h`;
                        })()
                      }
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm mb-4 bg-white/30 dark:bg-black/30 p-2 rounded-lg">
                    <div><strong className="text-text-muted">Crop:</strong> {s.crop}</div>
                    <div><strong className="text-text-muted">Tonnage:</strong> {s.tonnage}t</div>
                    <div className="col-span-2"><strong className="text-text-muted">Status:</strong> {s.status}</div>
                  </div>

                  <div className="mt-auto">
                    {isHigh && s.status === 'In Storage' && (() => {
                      const factoryMatch = industrialBuyers.find(b => b.target_crop === s.crop)?.buyer_name || "Regional Agro-Processing Cooperative Hub";
                      return (
                        <div className="space-y-3">
                          <div className="text-xs text-danger font-bold bg-danger/10 p-2 rounded">
                            🚨 URGENT: Auto-routing to {factoryMatch} to prevent total loss.
                          </div>
                          <Button onClick={() => promptDispatch(s.id, 'factory')} variant="primary" className="w-full justify-center !bg-danger hover:!bg-danger/80">
                            ✉️ Alert & Dispatch
                          </Button>
                        </div>
                      )
                    })()}

                    {isMed && s.status === 'In Storage' && (
                      <div className="space-y-3">
                        <div className="text-xs text-warning font-bold bg-warning/10 p-2 rounded">
                          ⚠️ Batch is degrading. Consider accelerated listing.
                        </div>
                        <Button onClick={() => promptDispatch(s.id, 'accelerated')} variant="primary" className="w-full justify-center !bg-warning hover:!bg-warning/80 !text-black">
                          ⚡ Accelerated List
                        </Button>
                      </div>
                    )}

                    {!isHigh && !isMed && s.status === 'In Storage' && (
                      <div className="space-y-3">
                        <div className="text-xs text-success font-bold bg-success/10 p-2 rounded">
                          ✅ Batch is stable and safely stored.
                        </div>
                        <Button onClick={() => promptDispatch(s.id, 'mandi')} variant="primary" className="w-full justify-center !bg-success hover:!bg-success/80 text-white">
                          🛒 Standard List
                        </Button>
                      </div>
                    )}

                    {strStartsWith(s.status, 'Listed') && (
                      <div className="text-center py-2 text-sm font-bold text-primary bg-primary/10 rounded">📢 Active in Market</div>
                    )}

                    {s.status === 'Awaiting Buyer Pickup Confirmation' && (
                      <Button onClick={() => promptDispatch(s.id, 'redirected')} className="w-full justify-center" variant="secondary">
                        ✅ Force Release
                      </Button>
                    )}

                    {s.status === 'Redirected' && (
                      <div className="text-center py-2 text-sm font-bold text-text-muted bg-background rounded">➡️ Diverted to Pipeline</div>
                    )}
                  </div>
                </GlassCard>
              );
            })}
          </div>
        ) : (
          <GlassCard className="p-8 text-center text-text-muted">No inventory available.</GlassCard>
        )}
      </div>



      {/* REGIONAL CROSS-CONNECT */}
      {user.role === 'admin' && (
        <>
          <div className="h-px bg-glass-border w-full my-6"></div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center gap-2">🔗 Regional Cross-Connect</h2>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input 
                  type="text" 
                  placeholder="Search by facility or district..." 
                  value={crossConnectSearch}
                  onChange={(e) => { setCrossConnectSearch(e.target.value); setCrossConnectPage(1); }}
                  className="input-field py-1.5 text-sm w-[400px] bg-background/50"
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
            </div>
            <GlassCard className="p-4 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-glass-border">
                    <th className="py-2">Facility Name</th>
                    <th className="py-2">District</th>
                    <th className="py-2 text-right">Total Storage</th>
                    <th className="py-2 text-right">Remaining Space</th>
                    <th className="py-2 text-right">Occupancy</th>
                    <th className="py-2 text-right">Rent Price</th>
                  </tr>
                </thead>
                <tbody>
                  {currentCrossConnectWarehouses.length > 0 ? (
                    currentCrossConnectWarehouses.map(w => (
                      <tr key={w.id} className="border-b border-glass-border/50 hover:bg-white/5 transition-colors">
                        <td className="py-3 text-sm">{w.facility_name}</td>
                        <td className="py-3 text-sm">{w.district}</td>
                        <td className="py-3 text-sm text-right">{w.capacity_mt} t</td>
                        <td className="py-3 text-sm text-right">
                          {(w.capacity_mt * (1 - w.occupancy_pct / 100)).toFixed(1)} t
                          <span className="text-text-muted text-xs ml-1">({(100 - w.occupancy_pct).toFixed(1)}%)</span>
                        </td>
                        <td className="py-3 text-sm text-right">{parseFloat(w.occupancy_pct).toFixed(1)}%</td>
                        <td className="py-3 text-sm text-right">₹{w.price_per_ton_day}/ton</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="6" className="py-4 text-center text-text-muted">No records found.</td></tr>
                  )}
                </tbody>
              </table>
              {totalCrossConnectPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-glass-border text-sm">
                  <span className="text-text-muted">
                    Showing {(crossConnectPage - 1) * CROSS_CONNECT_ITEMS_PER_PAGE + 1} to {Math.min(crossConnectPage * CROSS_CONNECT_ITEMS_PER_PAGE, filteredWarehouses.length)} of {filteredWarehouses.length}
                  </span>
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => setCrossConnectPage(p => Math.max(1, p - 1))}
                      disabled={crossConnectPage === 1}
                      variant="secondary"
                      className="!py-1 !px-3 !min-h-0 text-sm"
                    >
                      Prev
                    </Button>
                    <Button 
                      onClick={() => setCrossConnectPage(p => Math.min(totalCrossConnectPages, p + 1))}
                      disabled={crossConnectPage === totalCrossConnectPages}
                      variant="secondary"
                      className="!py-1 !px-3 !min-h-0 text-sm"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </GlassCard>
          </div>
        </>
      )}

      {/* MODALS */}
      {dispatchConfirm.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-6 border border-glass-border">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
                <Truck size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Confirm Dispatch</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Are you sure you want to proceed with this action? This will update the shipment status and alert the necessary parties.
              </p>
            </div>
            <div className="flex gap-4 w-full">
              <Button type="button" variant="secondary" className="flex-1 justify-center" onClick={() => setDispatchConfirm({ show: false, shipmentId: null, action: null })}>Cancel</Button>
              <Button type="button" className="flex-1 justify-center bg-primary text-white border-0" onClick={confirmDispatch}>Yes, Proceed</Button>
            </div>
          </div>
        </div>
      )}

      {inspectConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-6 border border-glass-border">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
                <CheckCircle size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Confirm Inspection</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Are you sure you want to log this inspection? This will accept the shipment into the vault inventory.
              </p>
            </div>
            <div className="flex gap-4 w-full">
              <Button type="button" variant="secondary" className="flex-1 justify-center" onClick={() => setInspectConfirm(false)}>Cancel</Button>
              <Button type="button" className="flex-1 justify-center bg-primary text-white border-0" onClick={confirmInspect}>Yes, Log It</Button>
            </div>
          </div>
        </div>
      )}

      {configConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-6 border border-glass-border">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
                <Save size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Confirm Configuration</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Are you sure you want to commit the warehouse matrix settings to the database?
              </p>
            </div>
            <div className="flex gap-4 w-full">
              <Button type="button" variant="secondary" className="flex-1 justify-center" onClick={() => setConfigConfirm(false)}>Cancel</Button>
              <Button type="button" className="flex-1 justify-center bg-primary text-white border-0" onClick={confirmConfigSave}>Yes, Commit</Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Warehouse;
