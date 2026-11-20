import React, { useContext } from 'react';
import { Leaf, ShieldCheck, TrendingDown, LogIn } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import GlassCard from '../components/GlassCard';
import Button from '../components/Button';
import { AuthContext } from '../context/AuthContext';

const Home = () => {
  const { user } = useContext(AuthContext);

  return (
    <div className="flex flex-col items-center justify-center pt-16 pb-24 text-center max-w-4xl mx-auto space-y-12">
      
      {/* Badge */}
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/5 text-primary text-sm font-medium">
        <Leaf size={16} />
        AI-Driven Agriculture
      </div>

      {/* Hero Text */}
      <div className="space-y-6">
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-text-main">
          Prevent Post-Harvest <br/>
          <span className="text-primary">Loss Before It Happens</span>
        </h1>
        <p className="text-base sm:text-lg text-text-muted max-w-2xl mx-auto">
          Empowering farmers and warehouse managers with predictive analytics to minimize spoilage and maximize yield value.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 justify-center w-full">
        {user ? (
          <>
            <NavLink to="/dashboard">
              <Button className="px-8 py-3 text-lg rounded-full">
                Dashboard <span>→</span>
              </Button>
            </NavLink>
            {(user.role === 'farmer' || user.role === 'admin') && (
              <NavLink to="/predict">
                <Button variant="secondary" className="px-8 py-3 text-lg rounded-full bg-white/50 dark:bg-black/20 text-text-main border border-glass-border">
                  Predict
                </Button>
              </NavLink>
            )}
            {(user.role === 'warehouse_manager' || user.role === 'admin') && (
              <NavLink to="/warehouse">
                <Button variant="secondary" className="px-8 py-3 text-lg rounded-full bg-white/50 dark:bg-black/20 text-text-main border border-glass-border">
                  Warehouse
                </Button>
              </NavLink>
            )}
          </>
        ) : (
          <NavLink to="/login">
            <Button className="px-8 py-3 text-lg rounded-full" icon={LogIn}>
              Login to Continue
            </Button>
          </NavLink>
        )}
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full pt-12">
        <GlassCard className="text-left bg-white/40 dark:bg-black/20 border-white/50">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
            <TrendingDown size={20} />
          </div>
          <h3 className="text-xl font-semibold mb-2">Loss Prediction</h3>
          <p className="text-text-muted text-sm leading-relaxed">
            Advanced ML models to predict potential spoilage based on temperature, humidity, and crop type.
          </p>
        </GlassCard>

        <GlassCard className="text-left bg-white/40 dark:bg-black/20 border-white/50">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
            <ShieldCheck size={20} />
          </div>
          <h3 className="text-xl font-semibold mb-2">Quality Monitoring</h3>
          <p className="text-text-muted text-sm leading-relaxed">
            Real-time insights into warehouse conditions to ensure optimal storage environments.
          </p>
        </GlassCard>

        <GlassCard className="text-left bg-white/40 dark:bg-black/20 border-white/50">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
            <Leaf size={20} />
          </div>
          <h3 className="text-xl font-semibold mb-2">Farmer Insights</h3>
          <p className="text-text-muted text-sm leading-relaxed">
            Actionable recommendations for farmers to improve post-harvest handling and transport.
          </p>
        </GlassCard>
      </div>
    </div>
  );
};

export default Home;
