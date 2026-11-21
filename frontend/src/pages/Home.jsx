import React, { useContext } from 'react';
import { Leaf, ShieldCheck, TrendingDown, LogIn } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import GlassCard from '../components/GlassCard';
import Button from '../components/Button';
import { AuthContext } from '../context/AuthContext';

const Home = () => {
  const { user } = useContext(AuthContext);

  return (
    <div className="flex flex-col items-center justify-center pt-8 sm:pt-16 pb-16 sm:pb-24 text-center max-w-4xl mx-auto px-3 sm:px-6 space-y-8 sm:space-y-12">
      
      {/* Badge */}
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs sm:text-sm font-medium">
        <Leaf size={16} />
        AI-Driven Agriculture
      </div>

      {/* Hero Text */}
      <div className="space-y-4 sm:space-y-6">
        <h1 className="text-2xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-text-main leading-tight">
          Prevent Post-Harvest <br className="hidden sm:inline" />
          <span className="text-primary">Loss Before It Happens</span>
        </h1>
        <p className="text-sm sm:text-lg text-text-muted max-w-2xl mx-auto px-2">
          Empowering farmers and warehouse managers with predictive analytics to minimize spoilage and maximize yield value.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 justify-center w-full max-w-xs sm:max-w-none mx-auto">
        {user ? (
          <>
            <NavLink to="/dashboard" className="w-full sm:w-auto">
              <Button className="w-full sm:w-auto justify-center px-8 py-3 text-base sm:text-lg rounded-full shadow-lg shadow-primary/20">
                Dashboard <span>→</span>
              </Button>
            </NavLink>
            {(user.role === 'farmer' || user.role === 'admin') && (
              <NavLink to="/predict" className="w-full sm:w-auto">
                <Button variant="secondary" className="w-full sm:w-auto justify-center px-8 py-3 text-base sm:text-lg rounded-full bg-white/50 dark:bg-black/20 text-text-main border border-glass-border">
                  Predict
                </Button>
              </NavLink>
            )}
            {(user.role === 'warehouse_manager' || user.role === 'admin') && (
              <NavLink to="/warehouse" className="w-full sm:w-auto">
                <Button variant="secondary" className="w-full sm:w-auto justify-center px-8 py-3 text-base sm:text-lg rounded-full bg-white/50 dark:bg-black/20 text-text-main border border-glass-border">
                  Warehouse
                </Button>
              </NavLink>
            )}
          </>
        ) : (
          <NavLink to="/login" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto justify-center px-8 py-3 text-base sm:text-lg rounded-full shadow-lg shadow-primary/20" icon={LogIn}>
              Login to Continue
            </Button>
          </NavLink>
        )}
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 w-full pt-6 sm:pt-10">
        <GlassCard className="text-left bg-white/40 dark:bg-black/20 border-white/50 p-4 sm:p-6">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3 sm:mb-4">
            <TrendingDown size={20} />
          </div>
          <h3 className="text-lg sm:text-xl font-semibold mb-1.5 sm:mb-2">Loss Prediction</h3>
          <p className="text-text-muted text-xs sm:text-sm leading-relaxed">
            Advanced ML models to predict potential spoilage based on temperature, humidity, and crop type.
          </p>
        </GlassCard>

        <GlassCard className="text-left bg-white/40 dark:bg-black/20 border-white/50 p-4 sm:p-6">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3 sm:mb-4">
            <ShieldCheck size={20} />
          </div>
          <h3 className="text-lg sm:text-xl font-semibold mb-1.5 sm:mb-2">Quality Monitoring</h3>
          <p className="text-text-muted text-xs sm:text-sm leading-relaxed">
            Real-time insights into warehouse conditions to ensure optimal storage environments.
          </p>
        </GlassCard>

        <GlassCard className="text-left bg-white/40 dark:bg-black/20 border-white/50 p-4 sm:p-6 sm:col-span-2 md:col-span-1">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3 sm:mb-4">
            <Leaf size={20} />
          </div>
          <h3 className="text-lg sm:text-xl font-semibold mb-1.5 sm:mb-2">Farmer Insights</h3>
          <p className="text-text-muted text-xs sm:text-sm leading-relaxed">
            Actionable recommendations for farmers to improve post-harvest handling and transport.
          </p>
        </GlassCard>
      </div>
    </div>
  );
};

export default Home;
