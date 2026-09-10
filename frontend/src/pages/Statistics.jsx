import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { LanguageContext } from '../context/LanguageContext';
import { ThemeContext } from '../context/ThemeContext';
import { aiAPI, predictionsAPI } from '../utils/api';
import GlassCard from '../components/GlassCard';
import { Cloud, TrendingUp, Loader, Volume2, LineChart, BarChart2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Plot from 'react-plotly.js';

const CROP_LIST = ["Tomato", "Onion", "Cucumber", "Potato"];
const DISTRICT_LIST = [
  "Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban",
  "Bidar", "Chamarajanagar", "Chikkaballapur", "Chitradurga", "Dakshina Kannada",
  "Davangere", "Dharwad", "Gadag", "Hassan", "Haveri", "Kalaburagi", "Kodagu",
  "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur", "Ramanagara", "Shivamogga",
  "Tumakuru", "Udupi", "Uttara Kannada", "Vijayanagar", "Vijayapura", "Yadgir",
];

const Statistics = () => {
  const { user } = useContext(AuthContext);
  const { t, language } = useContext(LanguageContext);
  const { isDark } = useContext(ThemeContext);
  
  const [district, setDistrict] = useState(user?.district || 'Bangalore');
  
  // Voice & Language state
  const appLanguage = language ? language.toLowerCase() : 'en';
  const [playingAudioIdx, setPlayingAudioIdx] = useState(null);
  
  // Suggestions state
  const [suggestions, setSuggestions] = useState(null);
  const [weather, setWeather] = useState(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  
  // Graph state
  const [selectedCropGraph, setSelectedCropGraph] = useState('Tomato');
  
  // Analytics & Filtering state
  const [cropFilter, setCropFilter] = useState("All");
  const [districtFilter, setDistrictFilter] = useState("All");
  const [analytics, setAnalytics] = useState(null);
  
  const marketTrendData = {
    Tomato: [
      { name: 'Day 1', price: 20 }, { name: 'Day 2', price: 22 }, { name: 'Day 3', price: 21 },
      { name: 'Day 4', price: 24 }, { name: 'Day 5', price: 25 }, { name: 'Day 6', price: 27 }, { name: 'Today', price: 26 }
    ],
    Onion: [
      { name: 'Day 1', price: 40 }, { name: 'Day 2', price: 42 }, { name: 'Day 3', price: 45 },
      { name: 'Day 4', price: 43 }, { name: 'Day 5', price: 46 }, { name: 'Day 6', price: 48 }, { name: 'Today', price: 50 }
    ],
    Potato: [
      { name: 'Day 1', price: 15 }, { name: 'Day 2', price: 15 }, { name: 'Day 3', price: 16 },
      { name: 'Day 4', price: 18 }, { name: 'Day 5', price: 17 }, { name: 'Day 6', price: 19 }, { name: 'Today', price: 20 }
    ],
    Cucumber: [
      { name: 'Day 1', price: 30 }, { name: 'Day 2', price: 28 }, { name: 'Day 3', price: 29 },
      { name: 'Day 4', price: 31 }, { name: 'Day 5', price: 33 }, { name: 'Day 6', price: 35 }, { name: 'Today', price: 34 }
    ]
  };

  useEffect(() => {
    fetchSuggestions();
  }, []);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const params = {};
        if (cropFilter !== "All") params.crop = cropFilter;
        if (districtFilter !== "All") params.district = districtFilter;
        
        const res = await predictionsAPI.getAnalytics(params);
        setAnalytics(res.data);
      } catch (err) {
        console.error("Failed to load analytics", err);
      }
    };
    if (user) {
       fetchAnalytics();
    }
  }, [user, cropFilter, districtFilter]);

  const fetchSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const res = await aiAPI.getSuggestions(district, appLanguage);
      setSuggestions(res.data.suggestions);
      setWeather(res.data.weather);
    } catch (err) {
      toast.error('Failed to load suggestions');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const playTTS = async (text, idx) => {
    if (playingAudioIdx !== null) return;
    setPlayingAudioIdx(idx);
    toast.loading("Generating audio...", { id: "tts" });
    try {
      const res = await predictionsAPI.getAdvisoryAudio({ text, lang: appLanguage });
      const audioUrl = URL.createObjectURL(res.data);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        setPlayingAudioIdx(null);
      };
      
      audio.play();
      toast.success("Playing audio", { id: "tts" });
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate audio", { id: "tts" });
      setPlayingAudioIdx(null);
    }
  };

  // --- Analytics Charts Data Prep ---
  let spx = [], spy = [];
  let pieLabels = [], pieValues = [], pieColors = [];
  let barLabels = [], barValues = [];

  if (analytics) {
    const trends = analytics.spoilage_trends || [];
    spx = trends.map((_, i) => i + 1);
    spy = trends;
    
    const risks = analytics.risk_distribution || {};
    pieLabels = Object.keys(risks).filter(k => risks[k] > 0);
    pieValues = pieLabels.map(k => risks[k]);
    pieColors = pieLabels.map(k => k === 'HIGH' ? '#ef4444' : k === 'MEDIUM' ? '#f97316' : '#22c55e');
    
    const loss = analytics.loss_by_crop || {};
    barLabels = Object.keys(loss);
    barValues = barLabels.map(k => loss[k]);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-green-600 bg-clip-text text-transparent flex items-center gap-3">
            <BarChart2 className="text-primary" size={32} />
            {t("Statistics")}
          </h1>
          <p className="text-text-muted mt-1">{t("Crop suggestions, weather, and market trends")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Column: Suggestions */}
        <GlassCard className="p-6 h-[550px] overflow-y-auto flex flex-col border border-primary/20">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <TrendingUp className="text-primary" /> {t("Crop Suggestions")}
            </h2>
            {suggestions && !loadingSuggestions && (
              <button 
                onClick={() => playTTS(suggestions, 'suggestions')}
                disabled={playingAudioIdx !== null}
                className="p-1.5 rounded-full bg-black/40 text-text-muted hover:text-white transition-colors"
                title="Listen to suggestions"
              >
                {playingAudioIdx === 'suggestions' ? <Loader className="animate-spin" size={16} /> : <Volume2 size={16} />}
              </button>
            )}
          </div>
          
          {loadingSuggestions ? (
            <div className="flex justify-center py-8"><Loader className="animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-4">
              {weather && (
                <div className="bg-[#e8f5e9] dark:bg-black/30 p-4 rounded-xl border border-primary/30 mb-6 shadow-md text-black dark:text-white">
                  <h3 className="text-sm font-bold uppercase mb-3 flex items-center gap-2 text-black/80 dark:text-white/80">
                    <Cloud size={18} /> Current Weather in {district}
                  </h3>
                  <div className="flex justify-between items-center text-black dark:text-white">
                    <div className="text-3xl font-bold">{weather.temp.toFixed(1)}°C</div>
                    <div className="text-right">
                      <div className="text-sm font-medium capitalize">{weather.desc}</div>
                      <div className="text-xs opacity-80 mt-1">Humidity: {weather.humidity}%</div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="prose prose-invert prose-sm max-w-none">
                {suggestions ? (
                  <ReactMarkdown>{suggestions}</ReactMarkdown>
                ) : (
                  <p className="text-text-muted italic">No suggestions available right now.</p>
                )}
              </div>
            </div>
          )}
        </GlassCard>

        {/* Right Column: Market Trends */}
        <GlassCard className="p-6 h-[550px] flex flex-col border border-primary/20">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <LineChart className="text-primary" /> {t("Market Trends")}
            </h2>
            <div className="flex gap-2 flex-wrap">
              {['Tomato', 'Onion', 'Potato', 'Cucumber'].map(crop => (
                <button
                  key={crop}
                  onClick={() => setSelectedCropGraph(crop)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedCropGraph === crop ? 'bg-primary text-black' : 'bg-black/20 dark:bg-white/10 text-text-muted hover:text-white'}`}
                >
                  {t(crop)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsLineChart data={marketTrendData[selectedCropGraph]}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.25)" : "rgba(20,83,45,0.3)"} />
                <XAxis dataKey="name" stroke={isDark ? "#e2e8f0" : "#14532d"} />
                <YAxis stroke={isDark ? "#e2e8f0" : "#14532d"} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: isDark ? '#0f172a' : '#e8f5e9', 
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(20,83,45,0.2)', 
                    color: isDark ? '#f8fafc' : '#14532d', 
                    borderRadius: '8px' 
                  }} 
                  itemStyle={{ color: isDark ? '#4ade80' : '#14532d', fontWeight: 'bold' }}
                />
                <Line type="monotone" dataKey="price" name="Price (₹/kg)" stroke="#16a34a" strokeWidth={3} dot={{ fill: '#16a34a', r: 4 }} activeDot={{ r: 8 }} />
              </RechartsLineChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

      </div>

      {/* Analytics Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 mb-2">
        <div>
          <label className="text-sm font-medium text-text-muted mb-1 block flex items-center gap-2">🌱 Filter Analytics by Crop</label>
          <select value={cropFilter} onChange={(e) => setCropFilter(e.target.value)} className="input-field bg-background/50 dark:bg-black/90 dark:text-white w-full">
            <option value="All">All Crops</option>
            {CROP_LIST.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-text-muted mb-1 block flex items-center gap-2">📍 Filter Analytics by District</label>
          <select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)} className="input-field bg-background/50 dark:bg-black/90 dark:text-white w-full">
            <option value="All">All Districts</option>
            {DISTRICT_LIST.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* Analytics Charts */}
      {analytics && (analytics.spoilage_trends || []).length >= 2 && (
        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <GlassCard className="p-1 flex flex-col justify-center overflow-hidden border border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
              <div className="p-4 pb-0 border-b border-glass-border bg-background/30 rounded-t-xl">
                 <h3 className="text-lg font-bold text-text-main mb-1">Spoilage Trend Analysis</h3>
                 <p className="text-xs text-text-muted mb-3">Probability of spoilage across recent prediction records.</p>
              </div>
              <div className="bg-black/10">
                <Plot
                  data={[{
                    x: spx,
                    y: spy,
                    type: 'scatter',
                    mode: 'lines+markers',
                    marker: { color: '#10b981', size: 6, line: { width: 2, color: '#fff'} },
                    line: { width: 3, shape: 'spline', color: '#10b981' },
                    fill: 'tozeroy',
                    fillcolor: 'rgba(16, 185, 129, 0.1)',
                    hoverinfo: 'y',
                    hovertemplate: '%{y:.1f}%<extra></extra>',
                  }]}
                  layout={{
                    xaxis: { title: "Prediction Sequence", color: 'var(--text-muted)', gridcolor: 'rgba(128,128,128,0.15)', zeroline: false },
                    yaxis: { title: "Spoilage Probability", color: 'var(--text-muted)', gridcolor: 'rgba(128,128,128,0.15)', zeroline: false, ticksuffix: '%' },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    font: { color: 'var(--text-main)', family: 'Inter, sans-serif' },
                    margin: { t: 30, b: 50, l: 60, r: 20 },
                    autosize: true,
                    hovermode: 'x unified'
                  }}
                  useResizeHandler={true}
                  style={{width: '100%', height: '350px'}}
                  config={{ displayModeBar: false }}
                />
              </div>
            </GlassCard>
            
            <GlassCard className="p-1 flex flex-col justify-center overflow-hidden border border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
              <div className="p-4 pb-0 border-b border-glass-border bg-background/30 rounded-t-xl">
                 <h3 className="text-lg font-bold text-text-main mb-1">Risk Level Distribution</h3>
                 <p className="text-xs text-text-muted mb-3">Overall breakdown of HIGH, MEDIUM, and LOW risk shipments.</p>
              </div>
              <div className="bg-black/10">
                <Plot
                  data={[{
                    labels: pieLabels,
                    values: pieValues,
                    type: 'pie',
                    hole: 0.5,
                    textinfo: 'label+percent',
                    textposition: 'outside',
                    hoverinfo: 'label+value',
                    hovertemplate: '%{label}<br>Count: %{value}<extra></extra>',
                    marker: { 
                      colors: pieColors,
                      line: { color: 'rgba(128,128,128,0.1)', width: 2 }
                    }
                  }]}
                  layout={{
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    font: { color: 'var(--text-main)', family: 'Inter, sans-serif' },
                    margin: { t: 40, b: 40, l: 40, r: 40 },
                    autosize: true,
                    showlegend: false
                  }}
                  useResizeHandler={true}
                  style={{width: '100%', height: '350px'}}
                  config={{ displayModeBar: false }}
                />
              </div>
            </GlassCard>
          </div>
          
          {barLabels.length > 0 && (
            <GlassCard className="mt-6 p-1 flex flex-col justify-center overflow-hidden border border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
              <div className="p-4 pb-0 border-b border-glass-border bg-background/30 rounded-t-xl">
                 <h3 className="text-lg font-bold text-text-main mb-1">Financial Loss Prevented by Crop</h3>
                 <p className="text-xs text-text-muted mb-3">Cumulative estimated financial savings segmented by crop type.</p>
              </div>
              <div className="bg-black/10">
                <Plot
                  data={[{
                    x: barLabels,
                    y: barValues,
                    type: 'bar',
                    text: barValues.map(v => '₹' + v.toLocaleString()),
                    textposition: 'auto',
                    hoverinfo: 'x+y',
                    hovertemplate: '%{x}<br>Saved: ₹%{y:,.0f}<extra></extra>',
                    marker: { 
                      color: barValues, 
                      colorscale: 'Greens', 
                      showscale: false,
                      line: { width: 1, color: 'rgba(128,128,128,0.2)' }
                    }
                  }]}
                  layout={{
                    xaxis: { color: 'var(--text-muted)', gridcolor: 'rgba(128,128,128,0.15)' },
                    yaxis: { title: "Financial Savings (₹)", color: 'var(--text-muted)', gridcolor: 'rgba(128,128,128,0.15)' },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    font: { color: 'var(--text-main)', family: 'Inter, sans-serif' },
                    margin: { t: 40, b: 40, l: 60, r: 20 },
                    autosize: true
                  }}
                  useResizeHandler={true}
                  style={{width: '100%', height: '350px'}}
                  config={{ displayModeBar: false }}
                />
              </div>
            </GlassCard>
          )}
        </div>
      )}

    </div>
  );
};

export default Statistics;
