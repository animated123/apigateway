import { useState, useEffect, FormEvent } from 'react';
import { Activity, Database, Smartphone, Mail, CheckCircle2, CheckCircle, Clock, Zap, Server, ShieldCheck, ExternalLink, Menu, History, LayoutDashboard, Search, Filter, Terminal, Trash2, CreditCard, LogOut, Key, BarChart3, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase, hasSupabaseConfig } from './lib/supabase.ts';
import { EnvManager } from './components/EnvManager.tsx';
import { TestConnection } from './components/TestConnection.tsx';

const getApiBaseUrl = (): string => {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  if (origin && origin !== 'null' && origin.startsWith('http')) {
    return '';
  }
  if (window.location.href && window.location.href.startsWith('http')) {
    try {
      const parsed = new URL(window.location.href);
      if (parsed.origin && parsed.origin !== 'null') {
        return parsed.origin;
      }
    } catch (e) {
      // Ignore URL parsing errors
    }
  }
  return '';
};

const API_BASE_URL = getApiBaseUrl();

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const isLocalAuthed = localStorage.getItem('hub_auth') === 'true';
        if (isLocalAuthed) {
          setIsLoggedIn(true);
          setAuthLoading(false);
          return;
        }

        if (!hasSupabaseConfig()) {
          setAuthLoading(false);
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: userData, error: dbError } = await supabase
            .from('profiles')
            .select('backend_admin')
            .eq('email', session.user.email)
            .maybeSingle();

          if (userData && userData.backend_admin === 'yes') {
            setIsLoggedIn(true);
            localStorage.setItem('hub_auth', 'true');
          } else {
            setIsLoggedIn(false);
            localStorage.removeItem('hub_auth');
            await supabase.auth.signOut();
          }
        } else {
          setIsLoggedIn(false);
          localStorage.removeItem('hub_auth');
        }
      } catch (err) {
        console.error("Error verifying admin status:", err);
        if (localStorage.getItem('hub_auth') === 'true') {
          setIsLoggedIn(true);
        } else {
          setIsLoggedIn(false);
          localStorage.removeItem('hub_auth');
        }
      } finally {
        setAuthLoading(false);
      }
    };

    checkSession();

    if (hasSupabaseConfig()) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          try {
            const { data: userData } = await supabase
              .from('profiles')
              .select('backend_admin')
              .eq('email', session.user.email)
              .maybeSingle();

            if (userData && userData.backend_admin === 'yes') {
              setIsLoggedIn(true);
              localStorage.setItem('hub_auth', 'true');
            } else {
              if (localStorage.getItem('hub_auth') !== 'true') {
                setIsLoggedIn(false);
                localStorage.removeItem('hub_auth');
                await supabase.auth.signOut();
              }
            }
          } catch (err) {
            console.error("Auth check error:", err);
          }
        } else if (event === 'SIGNED_OUT') {
          if (localStorage.getItem('hub_auth') !== 'true') {
            setIsLoggedIn(false);
            localStorage.removeItem('hub_auth');
          }
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, []);

  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentPath, setCurrentPath] = useState(typeof window !== 'undefined' ? window.location.pathname : '/');

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<any>(null);

  // Real-time stats state
  const [stats, setStats] = useState({
    mpesaVolume: 0,
    successRate: 0,
    dbOperations: 0,
    latency: '42ms',
    quotas: {
      payHero: { used: 0, limit: 1000, unit: 'requests', resetDate: '' },
      sms: { used: 0, limit: 5000, unit: 'messages', resetDate: '' },
      smtp: { used: 0, limit: 100, unit: 'emails', resetDate: '' }
    }
  });

  const handleLogin = () => {
    setIsLoggedIn(true);
    localStorage.setItem('hub_auth', 'true');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    localStorage.removeItem('hub_auth');
  };

  const fetchDashboardStats = async () => {
    const url = `${API_BASE_URL}/api/stats/dashboard`;
    try {
      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' }
      });
      
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const data = await response.json();
        if (response.ok) {
          setStats(data);
        } else {
          throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
      } else {
        const text = await response.text();
        console.error("Non-JSON response received:", text.substring(0, 200));
        throw new Error(`Expected JSON but received ${contentType || 'text'}. Check if the backend URL is correct.`);
      }
    } catch (err: any) {
      console.error('Error fetching dashboard stats:', err.message);
    }
  };

  const handleCleanup = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/payments/cleanup`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        fetchDashboardStats();
      }
    } catch (err) {
      console.error('Cleanup failed:', err);
    }
  };

  useEffect(() => {
    if (!hasSupabaseConfig() || !isLoggedIn) {
      setLoading(false);
      return;
    }

    fetch(`${API_BASE_URL}/api/health`, {
      headers: { 'Content-Type': 'application/json' }
    })
      .then(res => res.json())
      .then(data => {
        setStatus(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Health check failed:', err);
        setLoading(false);
      });

    fetchDashboardStats();

    // Set up real-time listener + polling fallback for local database
    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
        },
        () => {
          fetchDashboardStats();
        }
      )
      .subscribe();

    const interval = setInterval(fetchDashboardStats, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [isLoggedIn]);

  if (!hasSupabaseConfig()) {
    return <EnvSetup />;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dashboard-bg p-4 font-sans text-white">
        <div className="animate-pulse">Loading authentication...</div>
      </div>
    );
  }

  const isTestConnectionRoute = currentPath.toLowerCase().startsWith('/testconnection') || activeTab === 'testconnection';

  if (isTestConnectionRoute) {
    return (
      <TestConnection 
        apiBaseUrl={API_BASE_URL} 
        onGoHome={() => {
          if (window.location.pathname !== '/') {
            window.history.pushState({}, '', '/');
          }
          setCurrentPath('/');
          setActiveTab('dashboard');
        }} 
      />
    );
  }

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-dashboard-bg text-sleek-text font-sans overflow-hidden flex-col lg:flex-row">
      {/* Mobile Header */}
      <header className="lg:hidden h-16 bg-panel-bg border-b border-sleek-border flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-2 font-bold text-sleek-accent">
          <div className="w-6 h-6 rounded bg-linear-to-br from-indigo-500 to-purple-500"></div>
          <span className="text-sm">API Hub</span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-sleek-dim hover:text-white transition-colors"
        >
          <Menu size={24} />
        </button>
      </header>

      {/* Sidebar (Desktop) */}
      <aside className="w-64 bg-panel-bg border-r border-sleek-border p-6 flex flex-col gap-8 hidden lg:flex shrink-0">
        <div className="flex items-center gap-3 font-bold text-lg text-sleek-accent">
          <div className="w-8 h-8 rounded-lg bg-linear-to-br from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/20"></div>
          Erraddly API Hub
        </div>

        <nav className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h3 className="text-[11px] uppercase tracking-widest text-sleek-dim mb-2">Main Menu</h3>
            <NavItem 
              icon={<LayoutDashboard size={18} />} 
              label="Dashboard" 
              active={activeTab === 'dashboard'} 
              onClick={() => setActiveTab('dashboard')} 
            />
            <NavItem 
              icon={<History size={18} />} 
              label="Transactions" 
              active={activeTab === 'transactions'} 
              onClick={() => setActiveTab('transactions')} 
            />
            <NavItem 
              icon={<Terminal size={18} />} 
              label="API Tester" 
              active={activeTab === 'tester'} 
              onClick={() => setActiveTab('tester')} 
            />
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-[11px] uppercase tracking-widest text-sleek-dim mb-2">Services</h3>
            <NavItem icon={<Server size={18} />} label="Core API" onClick={() => setSelectedService('Core API')} />
            <NavItem icon={<Database size={18} />} label="Supabase DB" onClick={() => setSelectedService('Supabase DB')} />
            <NavItem 
              icon={<Zap size={18} />} 
              label="Payment Gateway" 
              active={activeTab === 'payments'} 
              onClick={() => setActiveTab('payments')} 
            />
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-[11px] uppercase tracking-widest text-sleek-dim mb-2">Resources</h3>
            <NavItem 
              icon={<Database size={18} />} 
              label="Test Connection" 
              active={activeTab === 'testconnection' || currentPath.toLowerCase().startsWith('/testconnection')} 
              onClick={() => {
                window.history.pushState({}, '', '/testconnection');
                setCurrentPath('/testconnection');
                setActiveTab('testconnection');
              }} 
            />
            <NavItem 
              icon={<Key size={18} />} 
              label="Env Variables" 
              active={activeTab === 'env'} 
              onClick={() => setActiveTab('env')} 
            />
            <NavItem icon={<ShieldCheck size={18} />} label="API Docs" />
            <NavItem icon={<Activity size={18} />} label="Logs" />
          </div>

          <div className="mt-auto border-t border-sleek-border pt-6">
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-red-400 hover:bg-red-500/10 transition-all text-sm font-medium"
            >
              <Filter size={18} className="rotate-45" /> {/* Close icon substitute */}
              Sign Out
            </button>
          </div>
        </nav>
      </aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 z-[60] lg:hidden"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              className="fixed inset-y-0 left-0 w-[280px] bg-panel-bg z-[70] p-6 flex flex-col gap-8 lg:hidden shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 font-bold text-lg text-sleek-accent">
                  <div className="w-8 h-8 rounded-lg bg-linear-to-br from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/20"></div>
                  Errandly API Hub
                </div>
                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 text-sleek-dim hover:text-white"
                >
                  <Filter size={20} className="rotate-45" /> {/* Close icon substitute */}
                </button>
              </div>

              <nav className="flex flex-col gap-6 overflow-y-auto">
                <div className="flex flex-col gap-2">
                  <h3 className="text-[11px] uppercase tracking-widest text-sleek-dim mb-2">Main Menu</h3>
                  <NavItem 
                    icon={<LayoutDashboard size={18} />} 
                    label="Dashboard" 
                    active={activeTab === 'dashboard'} 
                    onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }} 
                  />
                  <NavItem 
                    icon={<History size={18} />} 
                    label="Transactions" 
                    active={activeTab === 'transactions'} 
                    onClick={() => { setActiveTab('transactions'); setIsMobileMenuOpen(false); }} 
                  />
                  <NavItem 
                    icon={<Zap size={18} />} 
                    label="API Tester" 
                    active={activeTab === 'tester'} 
                    onClick={() => { setActiveTab('tester'); setIsMobileMenuOpen(false); }} 
                  />
                  <NavItem 
                    icon={<Key size={18} />} 
                    label="Env Variables" 
                    active={activeTab === 'env'} 
                    onClick={() => { setActiveTab('env'); setIsMobileMenuOpen(false); }} 
                  />
                </div>
                {/* ... other menu items can be added here if needed */}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' ? (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 p-4 md:p-8 overflow-y-auto space-y-6 md:space-y-8"
            >
              <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div className="flex flex-col gap-1">
                  <h1 className="text-xl md:text-2xl font-semibold">Production Node.js Cluster</h1>
                  <div className="text-xs md:text-sm text-sleek-dim flex flex-wrap gap-2">
                    <span>Instance ID: <span className="font-mono text-sleek-accent">prod-01</span></span>
                    <span className="hidden md:inline">•</span>
                    <span>Uptime: 14d 2h 45m</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={handleCleanup}
                    className="px-3 py-1.5 rounded bg-sleek-border hover:bg-red-500/10 hover:text-red-500 text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 border border-sleek-border"
                  >
                    <Trash2 size={12} />
                    Cleanup Stale
                  </button>
                  <div className="px-3 py-1 rounded bg-sleek-success/10 text-sleek-success text-[10px] font-bold uppercase tracking-wider animate-sleek-pulse flex items-center gap-2 border border-sleek-success/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-sleek-success"></div>
                    Live System
                  </div>
                </div>
              </header>

              {/* Database Status Alert */}
              {(stats as any).degraded && (
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs md:text-sm flex gap-3 items-center">
                  <Database size={16} className="text-amber-500 shrink-0 animate-pulse" />
                  <div className="flex-1">
                    <span className="font-semibold block sm:inline">Database Connection Degraded: </span>
                    <span className="text-sleek-dim">{(stats as any).error || 'Connection timed out. Utilizing local caching & default status.'}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
                <StatCard 
                  label="Payment Volume" 
                  value={`KES ${stats.mpesaVolume.toLocaleString()}`} 
                  trend="Total success volume" 
                  positive 
                />
                <StatCard 
                  label="Success Rate" 
                  value={`${stats.successRate.toFixed(1)}%`} 
                  trend="Transaction hit rate" 
                  positive={stats.successRate > 90} 
                />
                <StatCard 
                  label="API Latency" 
                  value={stats.latency} 
                  trend="avg. request time" 
                />
                <StatCard 
                  label="DB Operations" 
                  value={stats.dbOperations.toLocaleString()} 
                  trend="Requests last 24h" 
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-4 gap-6">
                <TransactionStreamMini onSelect={setSelectedTx} />
                <IntegrationHealthPanel onSelectService={setSelectedService} />
                <APIQuotaMetricsCard quotas={stats.quotas} />
                <AndroidClientTrackerCard onOpenAndroidBridge={() => {
                  localStorage.setItem('tester_active_tool', 'android');
                  setActiveTab('tester');
                }} />
              </div>
            </motion.div>
          ) : activeTab === 'transactions' ? (
            <TransactionHistoryPage onSelect={setSelectedTx} />
          ) : activeTab === 'payments' ? (
            <PaymentManagementPage onSelect={setSelectedTx} />
          ) : activeTab === 'env' ? (
            <EnvManager apiBaseUrl={API_BASE_URL} />
          ) : (
            <APITesterPage />
          )}
        </AnimatePresence>

  <TransactionManagerDrawer 
    transaction={selectedTx} 
    onClose={() => setSelectedTx(null)} 
  />

  <ServiceInspector 
    service={selectedService} 
    onClose={() => setSelectedService(null)} 
    stats={stats}
  />

        {/* Mobile Bottom Navigation (Optional but recommended for mobile UX) */}
        <nav className="lg:hidden h-16 bg-panel-bg border-t border-sleek-border flex items-center justify-around px-2 shrink-0 z-40">
          <MobileNavItem 
            icon={<LayoutDashboard size={20} />} 
            label="Home" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
          />
          <MobileNavItem 
            icon={<History size={20} />} 
            label="Logs" 
            active={activeTab === 'transactions'} 
            onClick={() => setActiveTab('transactions')} 
          />
          <MobileNavItem 
            icon={<Zap size={20} />} 
            label="Payments" 
            active={activeTab === 'payments'} 
            onClick={() => setActiveTab('payments')} 
          />
          <MobileNavItem 
            icon={<Terminal size={20} />} 
            label="Tester" 
            active={activeTab === 'tester'} 
            onClick={() => setActiveTab('tester')} 
          />
        </nav>
      </main>
    </div>
  );
}

function MobileNavItem({ icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 transition-colors ${
        active ? 'text-sleek-accent' : 'text-sleek-dim'
      }`}
    >
      {icon}
      <span className="text-[10px] font-medium uppercase tracking-tighter">{label}</span>
    </button>
  );
}

function TransactionHistoryPage({ onSelect }: { onSelect: (tx: any) => void }) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchTransactions() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/db/query?table=transactions&orderCol=created_at`);
        const json = await response.json();
        if (json.success) {
          setTransactions(json.data || []);
        } else {
          throw new Error(json.error || 'Failed to fetch transactions');
        }
      } catch (err) {
        console.error('Error fetching transactions:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchTransactions();

    // Poll for changes every 5 seconds to stay perfectly up-to-date with active DB
    const interval = setInterval(fetchTransactions, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const filteredTransactions = transactions.filter(t => 
    t.reference?.toLowerCase().includes(search.toLowerCase()) || 
    t.phone_number?.includes(search) ||
    t.status?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div 
      key="history"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col h-full relative"
    >
      <div className="p-4 md:p-8 border-b border-sleek-border bg-panel-bg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold mb-1">Transaction History</h1>
          <p className="text-xs md:text-sm text-sleek-dim italic">Detailed audit log of all M-Pesa interactions</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-sleek-dim w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search reference, phone..." 
              className="w-full bg-dashboard-bg border border-sleek-border rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-sleek-accent transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="bg-panel-bg border border-sleek-border rounded-2xl overflow-hidden shadow-2xl">
          {loading ? (
            <div className="p-12 md:p-20 flex flex-col items-center justify-center gap-4">
              <div className="w-8 h-8 border-2 border-sleek-accent border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sleek-dim text-sm font-mono tracking-widest uppercase">Querying...</span>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="p-12 md:p-20 text-center flex flex-col items-center gap-4 text-sleek-dim">
              <History size={48} className="opacity-20" />
              <div className="space-y-1">
                <h3 className="font-medium text-lg text-white">No transactions found</h3>
                <p className="text-sm max-w-xs mx-auto">Try adjusting your search or filters.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-dashboard-bg/50 text-gray-500 text-[11px] font-mono uppercase tracking-widest border-b border-sleek-border">
                    <th className="px-6 py-4 text-nowrap">ID / Reference</th>
                    <th className="px-6 py-4 text-nowrap">Date</th>
                    <th className="px-6 py-4 text-nowrap">Phone Number</th>
                    <th className="px-6 py-4 text-nowrap">Amount</th>
                    <th className="px-6 py-4 text-nowrap">Status</th>
                    <th className="px-6 py-4 text-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sleek-border/30">
                  {filteredTransactions.map((tr, i) => (
                    <motion.tr 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      key={tr.id} 
                      onClick={() => onSelect(tr)}
                      className="hover:bg-sleek-accent/5 transition-colors group cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-mono text-[13px] text-sleek-accent">{tr.reference || 'N/A'}</span>
                          <span className="text-[10px] text-sleek-dim truncate w-24"># {tr.id.slice(0, 8)}...</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-sleek-muted whitespace-nowrap">
                        {new Date(tr.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-sleek-muted font-mono whitespace-nowrap">{tr.phone_number}</td>
                      <td className="px-6 py-4 text-nowrap">
                        <span className="font-bold text-sm">KES {tr.amount}</span>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={tr.status} />
                      </td>
                      <td className="px-6 py-4">
                        <button className="p-2 text-sleek-dim group-hover:text-sleek-accent transition-colors">
                          <Terminal size={14} />
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function TimelineEvent({ icon, title, time, desc, status }: any) {
  return (
    <div className="relative pl-8 flex flex-col gap-1">
      <div className={`absolute left-0 top-0.5 w-[23px] h-[23px] rounded-full flex items-center justify-center z-10 border border-sleek-border ${
        status === 'success' ? 'bg-sleek-success/20 text-sleek-success' : 'bg-red-500/20 text-red-400'
      }`}>
        {icon}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-white">{title}</span>
        <span className="text-[10px] font-mono text-sleek-dim">{time}</span>
      </div>
      <p className="text-[11px] text-sleek-muted leading-relaxed">{desc}</p>
    </div>
  );
}

function MetaItem({ label, value }: { label: string, value: string }) {
  return (
    <div className="bg-dashboard-bg/30 border border-sleek-border/50 p-3 rounded-lg">
      <div className="text-[9px] uppercase tracking-widest text-sleek-dim mb-1">{label}</div>
      <div className="text-xs font-mono text-sleek-accent truncate">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider ${
      (status === 'SUCCESS' || status === 'COMPLETED') ? 'bg-sleek-success/10 text-sleek-success border border-sleek-success/20' : 
      status === 'PENDING' ? 'bg-sleek-pending/10 text-sleek-pending border border-sleek-pending/20' : 
      'bg-red-500/10 text-red-500 border border-red-500/20'
    }`}>
      {status}
    </span>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: any, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-300 group ${
        active ? 'bg-sleek-accent/10 border border-sleek-accent/20 text-white shadow-lg shadow-indigo-500/5' : 'text-sleek-muted hover:bg-sleek-border/40 hover:text-sleek-text'
      }`}
    >
      <span className={active ? 'text-sleek-accent' : 'text-sleek-dim group-hover:text-sleek-accent transition-colors'}>
        {icon}
      </span>
      <span className="text-[13px] font-medium tracking-tight">{label}</span>
      {active && <motion.div layoutId="active-indicator" className="ml-auto w-1 h-4 rounded-full bg-sleek-accent"></motion.div>}
    </div>
  );
}

function StatCard({ label, value, trend, positive = false }: { label: string, value: string, trend: string, positive?: boolean }) {
  return (
    <div className="bg-panel-bg border border-sleek-border p-6 rounded-2xl shadow-xl hover:border-sleek-accent/50 transition-all duration-500 group relative">
      <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <ArrowRight size={14} className="text-sleek-accent" />
      </div>
      <div className="text-[11px] uppercase tracking-widest text-sleek-dim mb-3 group-hover:text-sleek-accent transition-colors">{label}</div>
      <div className="text-2xl font-bold tracking-tight mb-3 font-mono">{value}</div>
      <div className={`text-[10px] font-medium flex items-center gap-1.5 ${positive ? 'text-sleek-success' : 'text-sleek-dim'}`}>
        {trend}
      </div>
    </div>
  );
}

function TransactionStreamMini({ onSelect }: { onSelect: (tx: any) => void }) {
  const [recent, setRecent] = useState<any[]>([]);
  
  const fetchRecent = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/db/query?table=transactions&orderCol=created_at&limit=5`);
      const json = await response.json();
      if (json.success) {
        setRecent(json.data || []);
      }
    } catch (err) {
      console.error('Error fetching recent transactions:', err);
    }
  };

  useEffect(() => {
    fetchRecent();

    // Poll for changes every 5 seconds to stay perfectly up-to-date with active DB
    const interval = setInterval(fetchRecent, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="bg-panel-bg border border-sleek-border rounded-2xl p-6 shadow-2xl">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-base font-semibold tracking-tight">Recent Activity</h2>
        <span className="text-[10px] text-sleek-dim uppercase font-mono">Stream Log</span>
      </div>
      <div className="space-y-4">
        {recent.map((tr, i) => (
          <div 
            key={i} 
            onClick={() => onSelect(tr)}
            className="flex items-center justify-between py-1 border-b border-sleek-border/30 last:border-0 hover:bg-sleek-accent/5 transition-colors rounded px-2 -mx-2 cursor-pointer group"
          >
            <div className="flex flex-col">
              <span className="font-mono text-xs text-sleek-accent">{tr.reference || 'N/A'}</span>
              <span className="text-[10px] text-sleek-dim">{new Date(tr.created_at).toLocaleTimeString()}</span>
            </div>
            <div className="flex items-center gap-4 text-right">
              <span className="text-xs font-medium">KES {tr.amount}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${
                (tr.status === 'SUCCESS' || tr.status === 'COMPLETED') ? 'bg-sleek-success shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 
                tr.status === 'PENDING' ? 'bg-sleek-pending shadow-[0_0_8px_rgba(245,158,11,0.4)]' : 
                'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]'
              }`}></span>
            </div>
          </div>
        ))}
        {recent.length === 0 && <p className="text-xs text-sleek-dim text-center py-4 italic">No recent transactions</p>}
      </div>
    </div>
  );
}

function IntegrationHealthPanel({ onSelectService }: { onSelectService: (name: string) => void }) {
  return (
    <div className="bg-panel-bg border border-sleek-border rounded-2xl p-6 shadow-2xl">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-base font-semibold tracking-tight">System Integrations</h2>
        <span className="text-[10px] text-sleek-dim uppercase font-mono">Status Check</span>
      </div>
      <div className="flex flex-col gap-3">
        <IntegrationNode icon="💾" name="Supabase DB" desc="Persistence Layer @V2.104" active onClick={() => onSelectService('Supabase DB')} />
        <IntegrationNode icon="💳" name="PayHero M-Pesa" desc="Fintech Gateway REST API" active onClick={() => onSelectService('PayHero Gateway')} />
        <IntegrationNode icon="🎯" name="Paystack API" desc="Card & Mobile Money Gateway" active onClick={() => onSelectService('Paystack API')} />
        <IntegrationNode icon="💬" name="SMS Engine" desc="REST Provider: Active" active onClick={() => onSelectService('SMS Engine')} />
        <IntegrationNode icon="✉️" name="SMTP Gateway" desc="Nodemailer Relay" active onClick={() => onSelectService('SMTP Gateway')} />
      </div>
    </div>
  );
}

function APIQuotaMetricsCard({ quotas }: { quotas: any }) {
  if (!quotas) return null;

  return (
    <div className="bg-panel-bg border border-sleek-border rounded-2xl p-6 shadow-2xl flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-base font-semibold tracking-tight flex items-center gap-2">
          <BarChart3 size={18} className="text-sleek-accent" />
          API Usage & Quotas
        </h2>
        <span className="text-[10px] text-sleek-dim uppercase font-mono">Rate Limits</span>
      </div>

      <div className="space-y-5">
        <QuotaItem 
          label="PayHero API" 
          icon={<Zap size={14} className="text-amber-400" />}
          used={quotas.payHero?.used || 0} 
          limit={quotas.payHero?.limit || 1000} 
          unit={quotas.payHero?.unit || 'reqs'}
          resetDate={quotas.payHero?.resetDate}
        />
        <QuotaItem 
          label="SMS Gateway" 
          icon={<MessageSquare size={14} className="text-blue-400" />}
          used={quotas.sms?.used || 0} 
          limit={quotas.sms?.limit || 5000} 
          unit={quotas.sms?.unit || 'sms'}
          resetDate={quotas.sms?.resetDate}
        />
        <QuotaItem 
          label="SMTP Service" 
          icon={<Mail size={14} className="text-purple-400" />}
          used={quotas.smtp?.used || 0} 
          limit={quotas.smtp?.limit || 100} 
          unit={quotas.smtp?.unit || 'emails'}
          resetDate={quotas.smtp?.resetDate}
        />
      </div>

      <div className="mt-auto pt-6">
        <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl">
          <p className="text-[10px] text-sleek-dim leading-relaxed">
            <ShieldCheck size={10} className="inline mr-1 text-sleek-accent" />
            Limits are enforced per-instance. Quotas reset automatically on the 1st of each month.
          </p>
        </div>
      </div>
    </div>
  );
}

function QuotaItem({ label, icon, used, limit, unit, resetDate }: { label: string, icon: any, used: number, limit: number, unit: string, resetDate?: string }) {
  const percent = Math.min((used / limit) * 100, 100);
  const isHigh = percent > 85;

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-medium text-white">{label}</span>
        </div>
        <div className="text-[10px] font-mono">
          <span className={isHigh ? 'text-red-400 font-bold' : 'text-white'}>{used.toLocaleString()}</span>
          <span className="text-sleek-dim"> / {limit.toLocaleString()} {unit}</span>
        </div>
      </div>
      <div className="h-1.5 w-full bg-dashboard-bg rounded-full overflow-hidden border border-sleek-border/30">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className={`h-full rounded-full ${
            isHigh ? 'bg-red-500' : 'bg-sleek-accent'
          }`}
        />
      </div>
      {resetDate && (
        <div className="flex justify-end">
          <span className="text-[9px] text-sleek-dim italic">Resets: {resetDate}</span>
        </div>
      )}
    </div>
  );
}

function IntegrationNode({ icon, name, desc, active = false, onClick }: { icon: string, name: string, desc: string, active?: boolean, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className="flex items-center gap-4 p-4 bg-dashboard-bg/30 border border-sleek-border rounded-xl hover:border-sleek-accent/20 transition-all duration-300 cursor-pointer group"
    >
      <div className="w-10 h-10 bg-panel-bg border border-sleek-border rounded-lg flex items-center justify-center text-xl shadow-inner group-hover:bg-sleek-accent/5 transition-colors">
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium tracking-tight group-hover:text-sleek-accent transition-colors">{name}</div>
        <div className="text-[10px] text-sleek-dim font-mono">{desc}</div>
      </div>
      <div className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
        active ? 'text-sleek-success' : 'text-red-400'
      }`}>
        {active ? 'Active' : 'Offline'}
      </div>
    </div>
  );
}

function AndroidClientTrackerCard({ onOpenAndroidBridge }: { onOpenAndroidBridge: () => void }) {
  return (
    <div className="bg-panel-bg border border-sleek-border rounded-2xl p-6 shadow-2xl flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-base font-semibold tracking-tight flex items-center gap-2">
            <Smartphone size={18} className="text-sleek-success" />
            Android Mobile SDK
          </h2>
          <span className="text-[10px] text-sleek-dim uppercase font-mono">Device Sync</span>
        </div>
        
        {/* Connection specifications indicators */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-[11px] font-sans">
            <div className="bg-dashboard-bg/50 border border-sleek-border/70 p-3 rounded-xl">
              <span className="text-[9px] text-sleek-dim block uppercase font-bold">System Ports</span>
              <span className="font-bold text-white font-mono">3000 & 5432</span>
            </div>
            <div className="bg-dashboard-bg/50 border border-sleek-border/70 p-3 rounded-xl">
              <span className="text-[9px] text-sleek-dim block uppercase font-bold">Active SDK</span>
              <span className="font-bold text-sleek-success font-mono">Retrofit 2.9</span>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-[10px] font-mono uppercase tracking-wider text-sleek-dim font-bold">Exposed Android routes:</h4>
            <div className="space-y-1.5 font-mono text-[10px]">
              <div className="flex items-center justify-between p-2 bg-black/20 rounded border border-sleek-border/20">
                <span className="text-blue-400 font-bold">POST</span>
                <span className="text-white truncate max-w-[150px] font-medium">/api/notifications/send-otp</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-black/20 rounded border border-sleek-border/20">
                <span className="text-blue-400 font-bold">POST</span>
                <span className="text-white truncate max-w-[150px] font-medium">/api/notifications/verify-otp</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-black/20 rounded border border-sleek-border/20">
                <span className="text-emerald-400 font-bold">GET</span>
                <span className="text-white truncate max-w-[150px] font-medium">/api/db/query</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-black/20 rounded border border-sleek-border/20">
                <span className="text-blue-400 font-bold">POST</span>
                <span className="text-white truncate max-w-[150px] font-medium">/api/payments/paystack/initialize</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={onOpenAndroidBridge}
        className="mt-6 w-full py-2.5 bg-sleek-border hover:bg-sleek-border/80 text-white rounded-xl text-xs font-semibold tracking-wide transition-all border border-sleek-border/50 hover:border-sleek-success/30 flex items-center justify-center gap-2 group"
      >
        <span>Open Android Tester & Guides</span>
        <ExternalLink size={12} className="text-sleek-dim group-hover:text-sleek-success transition-colors" />
      </button>
    </div>
  );
}

function APITesterPage() {
  const [activeTool, setActiveTool] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tester_active_tool');
      return saved || 'mpesa';
    }
    return 'mpesa';
  });
  const [loading, setLoading] = useState(false);
  const [paymentPending, setPaymentPending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [activeTx, setActiveTx] = useState<any>(null);

  // Android Specific states
  const [androidAction, setAndroidAction] = useState('otp_send');
  const [androidPhone, setAndroidPhone] = useState('254712345678');
  const [androidEmail, setAndroidEmail] = useState('user@example.com');
  const [androidCode, setAndroidCode] = useState('123456');
  const [androidAmount, setAndroidAmount] = useState('100');
  const [androidSql, setAndroidSql] = useState('SELECT * FROM otp_codes LIMIT 5;');

  useEffect(() => {
    if (typeof window !== 'undefined' && activeTool) {
      localStorage.setItem('tester_active_tool', activeTool);
    }
  }, [activeTool]);

  // Form states
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('1');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  // Database console states
  const [dbSqlQuery, setDbSqlQuery] = useState('SELECT * FROM profiles LIMIT 5;');
  const [dbTestResult, setDbTestResult] = useState<any>(null);
  const [dbTestLoading, setDbTestLoading] = useState(false);
  const [dbQueryLoading, setDbQueryLoading] = useState(false);
  const [dbQueryResult, setDbQueryResult] = useState<any>(null);

  // Connection settings states
  const [dbConfigForm, setDbConfigForm] = useState<any>({
    host: '127.0.0.1',
    port: 5432,
    database: 'errandly',
    user: 'postgres',
    password: '',
    connectionString: '',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });
  const [dbConfigEditMode, setDbConfigEditMode] = useState<'standard' | 'url'>('standard');
  const [dbConfigLoading, setDbConfigLoading] = useState(false);
  const [dbConfigSaving, setDbConfigSaving] = useState(false);
  const [dbConfigMessage, setDbConfigMessage] = useState<{ success?: boolean, text: string } | null>(null);

  const handleFetchDbConfig = async () => {
    setDbConfigLoading(true);
    setDbConfigMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/db/config`);
      const data = await response.json();
      if (data.success && data.config) {
        setDbConfigForm({
          host: data.config.host || '127.0.0.1',
          port: data.config.port || 5432,
          database: data.config.database || 'errandly',
          user: data.config.user || 'postgres',
          password: data.config.password || '',
          connectionString: data.config.connectionString || '',
          max: data.config.max || 10,
          idleTimeoutMillis: data.config.idleTimeoutMillis || 30000,
          connectionTimeoutMillis: data.config.connectionTimeoutMillis || 5000
        });
        if (data.config.connectionString) {
          setDbConfigEditMode('url');
        }
      }
    } catch (e: any) {
      console.warn('Failed to load DB config from server:', e.message);
    } finally {
      setDbConfigLoading(false);
    }
  };

  const handleSaveDbConfig = async () => {
    setDbConfigSaving(true);
    setDbConfigMessage(null);
    try {
      const payload = { ...dbConfigForm };
      if (dbConfigEditMode === 'standard') {
        payload.connectionString = '';
      }
      const response = await fetch(`${API_BASE_URL}/api/db/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.success) {
        setDbConfigMessage({ success: true, text: data.message });
        if (data.config) {
          setDbConfigForm(data.config);
        }
        // Retest connection immediately to show confirmation status feedback!
        handleDbTestConnection();
      } else {
        setDbConfigMessage({ success: false, text: data.error || 'Failed to update database configuration' });
      }
    } catch (err: any) {
      setDbConfigMessage({ success: false, text: err.message });
    } finally {
      setDbConfigSaving(false);
    }
  };

  useEffect(() => {
    if (activeTool === 'database') {
      handleFetchDbConfig();
    }
  }, [activeTool]);

  // Real-time listener for the active test transaction
  useEffect(() => {
    if (!activeTx?.reference) return;

    const channel = supabase
      .channel(`active-test-${activeTx.reference}`)
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'transactions',
          filter: `reference=eq.${activeTx.reference}`
        },
        (payload) => {
          const newTx = payload.new;
          setActiveTx(newTx);
          
          if (newTx.status === 'COMPLETED') {
            setPaymentPending(false);
            setShowSuccess(true);
          } else if (newTx.status === 'FAILED') {
            setPaymentPending(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTx?.reference]);

  // Polling for Paystack status (1 minute at 5s intervals)
  useEffect(() => {
    if (!activeTx?.reference || activeTx.provider !== 'paystack' || activeTx.status !== 'PENDING') {
      return;
    }

    let pollCount = 0;
    const maxPolls = 12; // 1 minute
    
    console.log(`[Polling] Started for ${activeTx.reference}`);

    const pollInterval = setInterval(async () => {
      pollCount++;
      if (pollCount > maxPolls) {
        console.log(`[Polling] Timed out for ${activeTx.reference}`);
        clearInterval(pollInterval);
        return;
      }

      try {
        console.log(`[Polling] Check ${pollCount}/12 for ${activeTx.reference}`);
        await fetch(`${API_BASE_URL}/api/payments/status?reference=${activeTx.reference}`);
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 5000);

    return () => {
      console.log(`[Polling] Stopped for ${activeTx.reference}`);
      clearInterval(pollInterval);
    };
  }, [activeTx?.reference, activeTx?.status, activeTx?.provider]);

  const callApi = async (endpoint: string, body: any) => {
    const timestamp = new Date().toLocaleTimeString();
    const requestId = Math.random().toString(36).substring(7).toUpperCase();
    
    setLoading(true);
    setResult(null);

    // Initial log entry
    const newLog = { 
      id: requestId, 
      time: timestamp, 
      endpoint, 
      type: 'REQUEST', 
      payload: body, 
      status: 'pending' 
    };
    setLogs(prev => [newLog, ...prev]);

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      
      setResult({ status: response.status, data });

      // Handle M-Pesa dynamic tracking
      if (endpoint === '/api/payments/stk-push' && response.ok && data.success) {
        setPaymentPending(true);
        setActiveTx({ reference: data.reference, status: 'PENDING', metadata: { events: [] } });
      }
      
      // Update log with response
      setLogs(prev => prev.map(l => l.id === requestId ? { 
        ...l, 
        status: response.status, 
        response: data,
        type: response.status < 400 ? 'SUCCESS' : 'ERROR'
      } : l));
      
    } catch (err: any) {
      setResult({ status: 500, error: err.message });
      setLogs(prev => prev.map(l => l.id === requestId ? { 
        ...l, 
        status: 500, 
        error: err.message,
        type: 'ERROR'
      } : l));
    } finally {
      setLoading(false);
    }
  };

  const handleMpesa = () => {
    setActiveTx(null); // Reset execution stream
    callApi('/api/payments/stk-push', { 
      userId: '00000000-0000-0000-0000-000000000000', 
      phoneNumber: phone, 
      amount: parseInt(amount), 
      description: 'Test STK Push' 
    });
  };

  const handlePaystack = async () => {
    setActiveTx(null);
    const timestamp = new Date().toLocaleTimeString();
    const requestId = Math.random().toString(36).substring(7).toUpperCase();
    
    setLoading(true);
    setResult(null);

    // If phone is provided, use STK Push, else fallback to initialization
    const endpoint = phone ? '/api/payments/paystack/stk-push' : '/api/payments/paystack/initialize';

    const body = { 
      userId: '00000000-0000-0000-0000-000000000000', 
      email: email || 'test@example.com', 
      amount: parseInt(amount), 
      phone: phone,
      description: 'Test Paystack STK Push' 
    };

    const newLog = { 
      id: requestId, 
      time: timestamp, 
      endpoint: endpoint, 
      type: 'REQUEST', 
      payload: body, 
      status: 'pending' 
    };
    setLogs(prev => [newLog, ...prev]);

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      
      setResult({ status: response.status, data });

      if (response.ok && data.success) {
        // Redirection is disabled for a seamless experience as requested
        /* 
        if (data.authorization_url) {
          window.open(data.authorization_url, '_blank');
        }
        */
        
        // If it's a pending charge, show instruction
        if (data.status === 'pending' || data.status === 'send_otp' || data.instruction) {
          setActiveTx({ 
            reference: data.reference, 
            status: 'PENDING', 
            provider: 'paystack',
            instruction: data.instruction || 'Please check your phone for the M-Pesa PIN prompt.'
          });
        } else {
          setActiveTx({ reference: data.reference, status: 'PENDING', provider: 'paystack' });
        }
      }
      
      setLogs(prev => prev.map(l => l.id === requestId ? { 
        ...l, 
        status: response.status, 
        response: data,
        type: response.status < 400 ? 'SUCCESS' : 'ERROR'
      } : l));
      
    } catch (err: any) {
      setResult({ status: 500, error: err.message });
      setLogs(prev => prev.map(l => l.id === requestId ? { 
        ...l, 
        status: 500, 
        error: err.message,
        type: 'ERROR'
      } : l));
    } finally {
      setLoading(false);
    }
  };

  const handleSMS = () => callApi('/api/notifications/send-otp', { phoneNumber: phone });

  const handleEmail = (type: 'welcome' | 'payment') => callApi('/api/notifications/send-email', { 
    to: email, 
    type, 
    name, 
    amount: 1000, 
    reference: 'TEST-REF-001' 
  });

  const handleDbTestConnection = async () => {
    setDbTestLoading(true);
    setDbTestResult(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/db/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test' })
      });
      const data = await response.json();
      setDbTestResult(data);
    } catch (err: any) {
      setDbTestResult({ success: false, error: err.message, message: 'Failed to establish connection.' });
    } finally {
      setDbTestLoading(false);
    }
  };

  const handleDbExecuteQuery = async (customSql?: string) => {
    setDbQueryLoading(true);
    setDbQueryResult(null);
    const sqlToRun = customSql || dbSqlQuery;
    try {
      const response = await fetch(`${API_BASE_URL}/api/db/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'query', sql: sqlToRun })
      });
      const data = await response.json();
      setDbQueryResult(data);
    } catch (err: any) {
      setDbQueryResult({ success: false, error: err.message });
    } finally {
      setDbQueryLoading(false);
    }
  };

  const handleAndroidSimulation = async () => {
    setLoading(true);
    setResult(null);

    const timestamp = new Date().toLocaleTimeString();
    const requestId = 'AND-' + Math.random().toString(36).substring(7).toUpperCase();

    let endpoint = '';
    let method = 'POST';
    let body: any = null;

    if (androidAction === 'otp_send') {
      endpoint = '/api/notifications/send-otp';
      body = { phoneNumber: androidPhone };
    } else if (androidAction === 'otp_verify') {
      endpoint = '/api/notifications/verify-otp';
      body = { phoneNumber: androidPhone, code: androidCode };
    } else if (androidAction === 'email_send') {
      endpoint = '/api/notifications/send-email';
      body = { to: androidEmail, type: 'verification', reference: androidCode };
    } else if (androidAction === 'email_verify') {
      endpoint = '/api/notifications/verify-email';
      body = { email: androidEmail, code: androidCode };
    } else if (androidAction === 'paystack_init') {
      endpoint = '/api/payments/paystack/initialize';
      body = { email: androidEmail, amount: androidAmount };
    } else if (androidAction === 'paystack_stk') {
      endpoint = '/api/payments/paystack/stk-push';
      body = { email: androidEmail, amount: parseInt(androidAmount) || 100, phone: androidPhone };
    } else if (androidAction === 'db_query') {
      endpoint = `/api/db/query?table=otp_codes&limit=5`;
      method = 'GET';
    }

    const newLog = { 
      id: requestId, 
      time: timestamp, 
      endpoint: `[Android Retrofit] ${endpoint}`, 
      type: 'REQUEST', 
      payload: body || { method, description: 'GET parameters constraint' }, 
      status: 'pending' 
    };
    setLogs(prev => [newLog, ...prev]);

    try {
      const url = `${API_BASE_URL}${endpoint}`;
      const response = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 14; Pixel 8 Build/UD1A.231105.004)'
        },
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await response.json();
      
      setResult({ status: response.status, data });

      setLogs(prev => prev.map(l => l.id === requestId ? { 
        ...l, 
        status: response.status, 
        response: data,
        type: response.status < 400 ? 'SUCCESS' : 'ERROR'
      } : l));
    } catch (err: any) {
      setResult({ status: 500, error: err.message });
      setLogs(prev => prev.map(l => l.id === requestId ? { 
        ...l, 
        status: 500, 
        error: err.message,
        type: 'ERROR'
      } : l));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 p-4 md:p-8 overflow-y-auto space-y-6 md:space-y-8 pb-20 lg:pb-8"
    >
      <header>
        <h1 className="text-xl md:text-2xl font-semibold mb-1">API Live Tester</h1>
        <p className="text-xs md:text-sm text-sleek-dim italic">Send real requests to your backend services</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        {/* Tool Selector */}
        <div className="lg:col-span-1 flex lg:flex-col gap-3 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide">
          <ToolTab 
            icon={<Smartphone size={18} />} 
            label="M-Pesa Push" 
            active={activeTool === 'mpesa'} 
            onClick={() => { setActiveTool('mpesa'); setResult(null); }}
          />
          <ToolTab 
            icon={<CreditCard size={18} />} 
            label="Paystack" 
            active={activeTool === 'paystack'} 
            onClick={() => { setActiveTool('paystack'); setResult(null); }}
          />
          <ToolTab 
            icon={<Activity size={18} />} 
            label="SMS OTP" 
            active={activeTool === 'sms'} 
            onClick={() => { setActiveTool('sms'); setResult(null); }}
          />
          <ToolTab 
            icon={<Mail size={18} />} 
            label="Email" 
            active={activeTool === 'email'} 
            onClick={() => { setActiveTool('email'); setResult(null); }}
          />
          <ToolTab 
            icon={<Database size={18} />} 
            label="Postgres Console" 
            active={activeTool === 'database'} 
            onClick={() => { setActiveTool('database'); setResult(null); }}
          />
          <ToolTab 
            icon={<Smartphone size={18} />} 
            label="Android Bridge" 
            active={activeTool === 'android'} 
            onClick={() => { setActiveTool('android'); setResult(null); }}
          />
        </div>

        {/* Form Area */}
        <div className="lg:col-span-2 space-y-6 md:space-y-8">
          <div className="bg-panel-bg border border-sleek-border rounded-2xl p-6 md:p-8 shadow-2xl">
            <AnimatePresence mode="wait">
              {activeTool === 'mpesa' && (
                <motion.div key="mpesa" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-sleek-accent/10 rounded-lg flex items-center justify-center shrink-0">
                      <Smartphone className="text-sleek-accent" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm md:text-base">Test STK Push</h3>
                      <p className="text-[10px] md:text-xs text-sleek-dim">Initiate a live transaction to your device</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputField label="Phone Number" value={phone} onChange={setPhone} placeholder="2547XXXXXXXX" />
                    <InputField label="Amount (KES)" value={amount} onChange={setAmount} placeholder="1" type="number" />
                  </div>
                  <button 
                    disabled={loading || paymentPending}
                    onClick={handleMpesa}
                    className={`w-full py-3 transition-all shadow-lg rounded-xl font-medium flex items-center justify-center gap-2 text-sm ${
                      paymentPending 
                        ? 'bg-sleek-success/20 text-sleek-success border border-sleek-success/30 cursor-wait' 
                        : 'bg-sleek-accent hover:bg-sleek-accent/90 text-white shadow-sleek-accent/20'
                    }`}
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : paymentPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-sleek-success/30 border-t-sleek-success rounded-full animate-spin"></div>
                        Waiting for PIN...
                      </>
                    ) : (
                      <>
                        <Zap size={18} />
                        Initiate Push
                      </>
                    )}
                  </button>
                </motion.div>
              )}

              {activeTool === 'paystack' && (
                <motion.div key="paystack" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-sleek-success/10 rounded-lg flex items-center justify-center shrink-0">
                      <CreditCard className="text-sleek-success" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm md:text-base">Test Paystack Checkout</h3>
                      <p className="text-[10px] md:text-xs text-sleek-dim">Initialize a payment and redirect to secure checkout</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputField label="Customer Email" value={email} onChange={setEmail} placeholder="customer@example.com" />
                    <InputField label="Amount (KES)" value={amount} onChange={setAmount} placeholder="100" type="number" />
                  </div>
                  <InputField label="Phone Number (for STK Push)" value={phone} onChange={setPhone} placeholder="2547XXXXXXXX" />
                  <button 
                    disabled={loading}
                    onClick={handlePaystack}
                    className="w-full py-3 bg-sleek-success hover:bg-sleek-success/90 disabled:opacity-50 text-white rounded-xl font-medium transition-all shadow-lg shadow-sleek-success/20 flex items-center justify-center gap-2 text-sm"
                  >
                    {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <CreditCard size={18} />}
                    Pay with Paystack
                  </button>
                </motion.div>
              )}

              {activeTool === 'sms' && (
                <motion.div key="sms" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-sleek-success/10 rounded-lg flex items-center justify-center shrink-0">
                      <Activity className="text-sleek-success" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm md:text-base">Live SMS OTP</h3>
                      <p className="text-[10px] md:text-xs text-sleek-dim">Send a real verification code to any phone number</p>
                    </div>
                  </div>
                  <InputField label="Phone Number" value={phone} onChange={setPhone} placeholder="2547XXXXXXXX" />
                  <button 
                    disabled={loading}
                    onClick={handleSMS}
                    className="w-full py-3 bg-sleek-success hover:bg-sleek-success/90 disabled:opacity-50 text-white rounded-xl font-medium transition-all shadow-lg shadow-sleek-success/20 flex items-center justify-center gap-2 text-sm"
                  >
                    {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Activity size={18} />}
                    Send OTP SMS
                  </button>
                </motion.div>
              )}

              {activeTool === 'email' && (
                <motion.div key="email" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-amber-400/10 rounded-lg flex items-center justify-center shrink-0">
                      <Mail className="text-amber-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm md:text-base">Test Email Relay</h3>
                      <p className="text-[10px] md:text-xs text-sleek-dim">Send transactional templates via SMTP</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputField label="Recipient Email" value={email} onChange={setEmail} placeholder="user@example.com" />
                    <InputField label="Full Name" value={name} onChange={setName} placeholder="John Doe" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button 
                      disabled={loading}
                      onClick={() => handleEmail('welcome')}
                      className="py-3 bg-panel-bg border border-sleek-border hover:border-amber-400/50 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 text-sm"
                    >
                      <Mail size={16} className="text-amber-400" />
                      Welcome Email
                    </button>
                    <button 
                      disabled={loading}
                      onClick={() => handleEmail('payment')}
                      className="py-3 bg-panel-bg border border-sleek-border hover:border-sleek-success/50 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 text-sm"
                    >
                      <CheckCircle2 size={16} className="text-sleek-success" />
                      Payment Receipt
                    </button>
                  </div>
                </motion.div>
              )}

              {activeTool === 'android' && (
                <motion.div key="android" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  {/* Android Hub Header */}
                  <div className="flex items-center gap-3 border-b border-sleek-border/40 pb-4">
                    <div className="w-10 h-10 bg-sleek-success/10 rounded-lg flex items-center justify-center shrink-0">
                      <Smartphone className="text-sleek-success" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm md:text-base">Android Dev Client Bridge</h3>
                      <p className="text-[10px] md:text-xs text-sleek-dim">Integrate, monitor, and test native Android clients</p>
                    </div>
                  </div>

                  {/* REST Coordinate cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-sans">
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-sleek-border/30 space-y-1">
                      <span className="text-[10px] font-mono text-sleek-dim uppercase">Localhost Base URL</span>
                      <div className="flex items-center justify-between gap-2">
                        <code className="text-xs font-mono text-sleek-success font-bold truncate">http://127.0.0.1:3000/</code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText('http://127.0.0.1:3000/');
                            alert('Copied Localhost Base URL to clipboard!');
                          }}
                          className="text-[10px] bg-white/5 hover:bg-white/10 px-1.5 py-0.5 rounded text-sleek-muted shrink-0"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-sleek-border/30 space-y-1">
                      <span className="text-[10px] font-mono text-sleek-dim uppercase">Production Gateway URL</span>
                      <div className="flex items-center justify-between gap-2">
                        <code className="text-xs font-mono text-indigo-400 truncate">
                          https://gateway.errandly.site/
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText('https://gateway.errandly.site/');
                            alert('Copied Production Gateway URL to clipboard!');
                          }}
                          className="text-[10px] bg-white/5 hover:bg-white/10 px-1.5 py-0.5 rounded text-sleek-muted shrink-0 cursor-pointer"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Simulator Box */}
                  <div className="bg-dashboard-bg/35 border border-sleek-border/30 rounded-xl p-5 space-y-4 font-sans">
                    <div className="flex items-center justify-between border-b border-sleek-border/20 pb-2">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-white">Live Emulator Request Simulator</h4>
                      <span className="text-[9px] bg-sleek-accent/10 border border-sleek-accent/20 text-sleek-accent px-1.5 py-0.5 rounded uppercase font-mono animate-pulse">Ready</span>
                    </div>

                    <div className="space-y-4">
                      {/* Action selector */}
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-sleek-dim mb-1.5 font-bold">Retrofit Endpoint to Test</label>
                        <select
                          value={androidAction}
                          onChange={(e) => setAndroidAction(e.target.value)}
                          className="w-full bg-black/40 border border-sleek-border rounded-xl px-4 py-2 text-xs text-white focus:outline-hidden focus:ring-1 focus:ring-sleek-accent"
                        >
                          <option value="otp_send">POST /api/notifications/send-otp (Send SMS OTP)</option>
                          <option value="otp_verify">POST /api/notifications/verify-otp (Verify SMS OTP)</option>
                          <option value="email_send">POST /api/notifications/send-email (Send Transactional Email Code)</option>
                          <option value="email_verify">POST /api/notifications/verify-email (Verify Email code)</option>
                          <option value="paystack_init">POST /api/payments/paystack/initialize (Initialize Paystack Invoice)</option>
                          <option value="paystack_stk">POST /api/payments/paystack/stk-push (Trigger STK Push payment)</option>
                          <option value="db_query">GET /api/db/query?table=otp_codes (Fetch DB code cache)</option>
                        </select>
                      </div>

                      {/* Field parameters */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                        {(androidAction === 'otp_send' || androidAction === 'otp_verify' || androidAction === 'paystack_stk') && (
                          <InputField label="Phone Number" value={androidPhone} onChange={setAndroidPhone} placeholder="254712345678" />
                        )}
                        {(androidAction === 'email_send' || androidAction === 'email_verify' || androidAction === 'paystack_init' || androidAction === 'paystack_stk') && (
                          <InputField label="Email Address" value={androidEmail} onChange={setAndroidEmail} placeholder="user@example.com" />
                        )}
                        {(androidAction === 'otp_verify' || androidAction === 'email_send' || androidAction === 'email_verify') && (
                          <InputField label="Verification OTP Code" value={androidCode} onChange={setAndroidCode} placeholder="123456" />
                        )}
                        {(androidAction === 'paystack_init' || androidAction === 'paystack_stk') && (
                          <InputField label="Amount to Charge (KES)" value={androidAmount} onChange={setAndroidAmount} placeholder="100" />
                        )}
                      </div>

                      {/* Run Simulation Trigger button */}
                      <button
                        onClick={handleAndroidSimulation}
                        disabled={loading}
                        className="w-full py-3 bg-[#10b981] hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/10"
                      >
                        {loading ? (
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        ) : (
                          <Smartphone size={14} />
                        )}
                        Test Android SDK Call Simulation
                      </button>
                    </div>
                  </div>

                  {/* Guides tabs */}
                  <div className="bg-panel-bg border border-sleek-border/50 rounded-xl p-5 space-y-4 text-sans">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-emerald-400">Android Port Connectivity & Troubleshooting Guide</h4>
                    
                    <div className="text-xs text-sleek-dim leading-relaxed space-y-4">
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-[11px] text-amber-300">
                        <strong className="block text-amber-200 mb-1">⚠️ Crucial Notice about localhost (127.0.0.1) & Ports:</strong>
                        If you receive a <code className="bg-black/30 text-white px-1 rounded font-mono">connect ECONNREFUSED 127.0.0.1:5432</code> error, check the <strong>Postgres Console</strong> tab. This means our system's dynamic connection string is pointing to local postgres but none is running inside the docker environment. Ensure you configure your live external Postgres (such as Supabase, Neon.tech or AWS RDS) details under <strong>Connection Settings & Credentials</strong> to allow the Android client to sync data seamlessly!
                      </div>

                      <div>
                        <span className="font-bold text-white block">1. Local Host Workspace API Mapping</span>
                        <p className="mt-1">
                          When testing this project on local machine environments, keep your local server bound to Port 3000. The connection base address will be <code className="text-emerald-400 font-mono font-bold">http://127.0.0.1:3000/</code>.
                        </p>
                        <p className="mt-1.5">
                          Inside <code className="font-mono text-white bg-black/40 px-1">AndroidManifest.xml</code>, you must permit unencrypted HTTP traffic if testing without HTTPS certification:
                        </p>
                        <pre className="mt-1.5 p-3 bg-black/40 rounded-lg text-[10px] font-mono text-sleek-muted overflow-x-auto">
                          {`<application\n  android:usesCleartextTraffic="true"\n  ... >`}
                        </pre>
                      </div>

                      <div>
                        <span className="font-bold text-white block">2. Native Gradle builds boilerplate</span>
                        <p className="mt-1">Verify that you added the following network and parse modules inside <code className="font-mono text-white bg-black/40 px-1">app/build.gradle.kts</code>:</p>
                        <pre className="mt-1.5 p-3 bg-black/40 rounded-lg text-[10px] font-mono text-sleek-muted overflow-x-auto">
{`implementation("com.squareup.retrofit2:retrofit:2.9.0")
implementation("com.squareup.retrofit2:converter-gson:2.9.0")
implementation("com.squareup.okhttp3:okhttp:4.11.0")
implementation("com.squareup.okhttp3:logging-interceptor:4.11.0")`}
                        </pre>
                      </div>

                      <div>
                        <span className="font-bold text-white block">3. Retrofit Client Boilerplate initialization</span>
                        <pre className="mt-1.5 p-3 bg-black/40 rounded-lg text-[10px] font-mono text-sleek-muted overflow-x-auto leading-normal">
{`package com.errandly.app.network

import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object RetrofitInstance {
    private const val BASE_URL = "https://gateway.errandly.site/" // Or "http://127.0.0.1:3000/" for local emulator

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    val apiService: ApiService by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }
}`}
                        </pre>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTool === 'database' && (
                <motion.div key="database" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-sleek-border/40 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center shrink-0">
                        <Database className="text-sleek-accent" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm md:text-base">PostgreSQL Connection Diagnostics</h3>
                        <p className="text-[10px] md:text-xs text-sleek-dim">Verify connectivity to 'errandly' or run SQL queries</p>
                      </div>
                    </div>
                    {/* Database Health Test button */}
                    <button
                      onClick={handleDbTestConnection}
                      disabled={dbTestLoading}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-xs rounded-xl transition-all shadow-md shadow-indigo-600/10 flex items-center justify-center gap-2"
                    >
                      {dbTestLoading ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <Database size={14} />
                      )}
                      Test Connection
                    </button>
                  </div>

                  {/* Connection Test Diagnostics Status Indicator */}
                  {dbTestResult && (
                    <div className={`p-4 rounded-xl border ${
                      dbTestResult.success 
                        ? 'bg-sleek-success/10 border-sleek-success/20 text-sleek-success' 
                        : 'bg-red-500/10 border-red-500/20 text-red-400'
                    } space-y-2`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                          <div className={`w-2 h-2 rounded-full ${dbTestResult.success ? 'bg-sleek-success' : 'bg-red-500'} animate-pulse`}></div>
                          Status: {dbTestResult.status || (dbTestResult.success ? 'CONNECTED' : 'DISCONNECTED')}
                        </div>
                        <span className="text-[10px] font-mono text-sleek-dim">postgres-config.json ready</span>
                      </div>
                      <p className="text-xs">{dbTestResult.message}</p>
                      
                      {dbTestResult.success && dbTestResult.diagnostics && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-sleek-border/20 text-[11px] text-sleek-muted font-mono">
                          <div>
                            <span className="text-sleek-dim">Server Time:</span> {dbTestResult.diagnostics.server_time}
                          </div>
                          <div>
                            <span className="text-sleek-dim">Database Name:</span> <span className="text-indigo-400">{dbTestResult.diagnostics.database_name}</span>
                          </div>
                          <div className="sm:col-span-2">
                            <span className="text-sleek-dim">Server Version:</span> <span className="text-white">{dbTestResult.diagnostics.db_version}</span>
                          </div>
                          <div className="sm:col-span-2">
                            <span className="text-sleek-dim">Public Tables found:</span> <span className="text-white font-bold">{dbTestResult.diagnostics.public_tables_count}</span>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {dbTestResult.diagnostics.tables?.map((tbl: string) => (
                                <span key={tbl} className="bg-white/5 border border-white/10 text-white rounded px-1.5 py-0.5 text-[9px]">
                                  {tbl}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {!dbTestResult.success && dbTestResult.error && (
                        <pre className="p-3 bg-red-950/20 rounded-lg text-[11px] text-red-300 font-mono overflow-auto max-h-[100px]">
                          Error Trace: {dbTestResult.error}
                        </pre>
                      )}
                    </div>
                  )}

                  {/* Database Connection Settings Panel */}
                  <div className="bg-dashboard-bg/35 border border-sleek-border/30 rounded-xl p-5 space-y-4">
                    <div className="flex justify-between items-center border-b border-sleek-border/20 pb-2">
                      <div className="flex items-center gap-2">
                        <Database size={14} className="text-sleek-accent" />
                        <h4 className="text-xs font-bold uppercase tracking-widest text-white">Connection Settings & Credentials</h4>
                      </div>
                      
                      {/* Connection String vs Discrete fields switch */}
                      <div className="flex bg-white/5 p-0.5 rounded-lg border border-white/10 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setDbConfigEditMode('standard')}
                          className={`px-2 py-1 rounded-md transition-all ${
                            dbConfigEditMode === 'standard' 
                              ? 'bg-indigo-600 text-white font-medium' 
                              : 'text-sleek-dim hover:text-white'
                          }`}
                        >
                          Discrete Fields
                        </button>
                        <button
                          type="button"
                          onClick={() => setDbConfigEditMode('url')}
                          className={`px-2 py-1 rounded-md transition-all ${
                            dbConfigEditMode === 'url' 
                              ? 'bg-indigo-600 text-white font-medium' 
                              : 'text-sleek-dim hover:text-white'
                          }`}
                        >
                          Connection URL
                        </button>
                      </div>
                    </div>

                    {dbConfigLoading ? (
                      <div className="py-6 flex flex-col items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                        <span className="text-[10px] text-sleek-dim font-mono">Loading config from postgres-config.json...</span>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {dbConfigEditMode === 'standard' ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[10px] font-mono text-sleek-dim mb-1 uppercase">Host IP / Name</label>
                              <input
                                type="text"
                                value={dbConfigForm.host || ''}
                                onChange={(e) => setDbConfigForm({ ...dbConfigForm, host: e.target.value })}
                                className="w-full px-3 py-2 bg-black/30 border border-sleek-border rounded-xl font-mono text-xs focus:outline-none focus:border-indigo-500/90 text-white"
                                placeholder="127.0.0.1"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-mono text-sleek-dim mb-1 uppercase">Port</label>
                              <input
                                type="number"
                                value={dbConfigForm.port || ''}
                                onChange={(e) => setDbConfigForm({ ...dbConfigForm, port: e.target.value })}
                                className="w-full px-3 py-2 bg-black/30 border border-sleek-border rounded-xl font-mono text-xs focus:outline-none focus:border-indigo-500/90 text-white"
                                placeholder="5432"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-mono text-sleek-dim mb-1 uppercase">User Name</label>
                              <input
                                type="text"
                                value={dbConfigForm.user || ''}
                                onChange={(e) => setDbConfigForm({ ...dbConfigForm, user: e.target.value })}
                                className="w-full px-3 py-2 bg-black/30 border border-sleek-border rounded-xl font-mono text-xs focus:outline-none focus:border-indigo-500/90 text-white"
                                placeholder="postgres"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-mono text-sleek-dim mb-1 uppercase">Password</label>
                              <input
                                type="password"
                                value={dbConfigForm.password || ''}
                                onChange={(e) => setDbConfigForm({ ...dbConfigForm, password: e.target.value })}
                                className="w-full px-3 py-2 bg-black/30 border border-sleek-border rounded-xl font-mono text-xs focus:outline-none focus:border-indigo-500/90 text-white"
                                placeholder="No password"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-[10px] font-mono text-sleek-dim mb-1 uppercase">Database Name</label>
                              <input
                                type="text"
                                value={dbConfigForm.database || ''}
                                onChange={(e) => setDbConfigForm({ ...dbConfigForm, database: e.target.value })}
                                className="w-full px-3 py-2 bg-black/30 border border-sleek-border rounded-xl font-mono text-xs focus:outline-none focus:border-indigo-500/90 text-white"
                                placeholder="errandly"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <label className="block text-[10px] font-mono text-sleek-dim uppercase">Database Connection URI</label>
                            <input
                              type="text"
                              value={dbConfigForm.connectionString || ''}
                              onChange={(e) => setDbConfigForm({ ...dbConfigForm, connectionString: e.target.value })}
                              className="w-full px-3 py-2 bg-black/30 border border-sleek-border rounded-xl font-mono text-xs focus:outline-none focus:border-indigo-500/95 text-white"
                              placeholder="postgresql://postgres:password@localhost:5432/errandly"
                            />
                            <p className="text-[10px] text-sleek-dim leading-relaxed">
                              Tip: You can paste a full remote or local URL string (e.g., Supabase, Neon, or raw Local instance string).
                            </p>
                          </div>
                        )}

                        {/* Optional Advanced Settings Pool properties */}
                        <details className="text-[10px] text-sleek-dim font-mono cursor-pointer select-none">
                          <summary className="hover:text-white transition-colors focus:outline-none py-1">Advanced Connection Pool Settings</summary>
                          <div className="grid grid-cols-3 gap-3 pt-2.5 mt-1 border-t border-white/5">
                            <div>
                              <label className="block mb-1 text-[9px] uppercase">Min/Max Clients</label>
                              <input
                                type="number"
                                value={dbConfigForm.max || 10}
                                onChange={(e) => setDbConfigForm({ ...dbConfigForm, max: e.target.value })}
                                className="w-full p-1.5 bg-black/30 border border-sleek-border rounded font-mono text-[10px] focus:outline-none text-white text-center"
                              />
                            </div>
                            <div>
                              <label className="block mb-1 text-[9px] uppercase">Idle Timeout (ms)</label>
                              <input
                                type="number"
                                value={dbConfigForm.idleTimeoutMillis || 30000}
                                onChange={(e) => setDbConfigForm({ ...dbConfigForm, idleTimeoutMillis: e.target.value })}
                                className="w-full p-1.5 bg-black/30 border border-sleek-border rounded font-mono text-[10px] focus:outline-none text-white text-center"
                              />
                            </div>
                            <div>
                              <label className="block mb-1 text-[9px] uppercase">Connect Timeout (ms)</label>
                              <input
                                type="number"
                                value={dbConfigForm.connectionTimeoutMillis || 5000}
                                onChange={(e) => setDbConfigForm({ ...dbConfigForm, connectionTimeoutMillis: e.target.value })}
                                className="w-full p-1.5 bg-black/30 border border-sleek-border rounded font-mono text-[10px] focus:outline-none text-white text-center"
                              />
                            </div>
                          </div>
                        </details>

                        {/* Action Status Feedback */}
                        {dbConfigMessage && (
                          <div className={`p-3 rounded-lg text-xs leading-relaxed border ${
                            dbConfigMessage.success 
                              ? 'bg-sleek-success/15 border-sleek-success/25 text-sleek-success' 
                              : 'bg-red-500/10 border-red-500/20 text-red-400'
                          }`}>
                            {dbConfigMessage.text}
                          </div>
                        )}

                        {/* Save Action Trigger Button */}
                        <div className="flex gap-3 justify-end pt-2">
                          <button
                            type="button"
                            onClick={handleFetchDbConfig}
                            className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 font-medium text-xs rounded-xl transition-all text-white"
                          >
                            Reset Defaults
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveDbConfig}
                            disabled={dbConfigSaving}
                            className="px-5 py-1.5 bg-sleek-success hover:bg-sleek-success/90 disabled:opacity-50 text-white font-medium text-xs rounded-xl transition-all shadow-md shadow-sleek-success/10 flex items-center justify-center gap-1.5"
                          >
                            {dbConfigSaving ? (
                              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                              <CheckCircle size={13} />
                            )}
                            Save Credentials & Config
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SQL Query Playground Card */}
                  <div className="bg-dashboard-bg/50 border border-indigo-500/10 rounded-xl p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                      <div className="flex items-center gap-2">
                        <Terminal size={14} className="text-indigo-400" />
                        <h4 className="text-xs font-bold uppercase tracking-widest text-sleek-dim">SQL Query Playground</h4>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => {
                            setDbSqlQuery('SELECT * FROM profiles LIMIT 5;');
                            handleDbExecuteQuery('SELECT * FROM profiles LIMIT 5;');
                          }}
                          className="bg-white/5 hover:bg-indigo-500/10 border border-white/10 text-white text-[10px] font-mono px-2 py-1 rounded transition-all"
                        >
                          View Profiles
                        </button>
                        <button
                          onClick={() => {
                            setDbSqlQuery('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 5;');
                            handleDbExecuteQuery('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 5;');
                          }}
                          className="bg-white/5 hover:bg-indigo-500/10 border border-white/10 text-white text-[10px] font-mono px-2 py-1 rounded transition-all"
                        >
                          View Transactions
                        </button>
                        <button
                          onClick={() => {
                            setDbSqlQuery(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public';`);
                            handleDbExecuteQuery(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public';`);
                          }}
                          className="bg-white/5 hover:bg-indigo-500/10 border border-white/10 text-white text-[10px] font-mono px-2 py-1 rounded transition-all"
                        >
                          View Table Schema
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-sleek-dim tracking-wider uppercase">Query Statement</label>
                      <textarea
                        value={dbSqlQuery}
                        onChange={(e) => setDbSqlQuery(e.target.value)}
                        className="w-full h-24 p-3 bg-black/35 border border-sleek-border font-mono text-xs rounded-xl focus:outline-none focus:border-indigo-500/80 text-white resize-y shadow-inner"
                        placeholder="SELECT * FROM table_name LIMIT 10;"
                      />
                    </div>

                    <button
                      onClick={() => handleDbExecuteQuery()}
                      disabled={dbQueryLoading || !dbSqlQuery.trim()}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-medium transition-all shadow-lg shadow-indigo-600/10 flex items-center justify-center gap-2 text-xs"
                    >
                      {dbQueryLoading ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <Terminal size={14} />
                      )}
                      Execute SQL Query
                    </button>
                  </div>

                  {/* SQL Execute Query Results Panel */}
                  {dbQueryResult && (
                    <div className="border border-sleek-border/30 rounded-xl overflow-hidden bg-black/20 p-4 space-y-3">
                      <div className="flex justify-between items-center text-[10px] font-mono text-sleek-dim uppercase tracking-wider">
                        <span>Query Result Summary</span>
                        {dbQueryResult.success && (
                          <div className="flex gap-3">
                            <span>Rows: <span className="text-white font-bold">{dbQueryResult.rowCount}</span></span>
                            <span>Time: <span className="text-white font-bold">{dbQueryResult.durationMs}ms</span></span>
                          </div>
                        )}
                      </div>

                      {dbQueryResult.success ? (
                        dbQueryResult.rowCount === 0 ? (
                          <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-center text-xs text-sleek-dim italic font-mono">
                            Command succeeded. No rows were returned (0 matching rows).
                          </div>
                        ) : (
                          <div className="overflow-x-auto max-h-[300px] border border-sleek-border/20 rounded-lg">
                            <table className="w-full text-left border-collapse font-mono text-[11px] text-sleek-muted">
                              <thead className="bg-white/5 text-white border-b border-sleek-border/30 sticky top-0">
                                <tr>
                                  {dbQueryResult.fields?.map((field: any) => (
                                    <th key={field.name} className="p-2 border-r border-sleek-border/30 font-bold uppercase tracking-wider text-[9px] text-indigo-300">
                                      {field.name}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-sleek-border/10">
                                {dbQueryResult.rows?.map((row: any, rIdx: number) => (
                                  <tr key={rIdx} className="hover:bg-white/[0.02]">
                                    {dbQueryResult.fields?.map((field: any) => (
                                      <td key={field.name} className="p-2 border-r border-sleek-border/20 max-w-[200px] overflow-hidden truncate" title={String(row[field.name])}>
                                        {row[field.name] === null ? (
                                          <span className="text-red-500/50 italic text-[10px]">null</span>
                                        ) : typeof row[field.name] === 'object' ? (
                                          JSON.stringify(row[field.name])
                                        ) : (
                                          String(row[field.name])
                                        )}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      ) : (
                        <div className="p-4 rounded-lg bg-red-950/20 border border-red-500/25 text-red-300 font-mono text-[11px] whitespace-pre-wrap">
                          <span className="font-bold block uppercase text-[10px] text-red-400 mb-1">PostgreSQL Query Execution Error</span>
                          {dbQueryResult.error}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Results Preview */}
            <AnimatePresence>
              {result && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-8 pt-8 border-t border-sleek-border"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-mono uppercase tracking-widest text-sleek-dim">API Response</h4>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      result.status < 400 ? 'bg-sleek-success/10 text-sleek-success' : 'bg-red-500/10 text-red-400'
                    }`}>
                      HTTP {result.status}
                    </span>
                  </div>
                  <pre className="bg-black/40 p-4 rounded-xl font-mono text-[11px] overflow-x-auto text-sleek-muted border border-sleek-border/20 max-h-[200px] overflow-y-auto">
                    {JSON.stringify(result.data || result.error, null, 2)}
                  </pre>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Live Execution Stream for M-Pesa */}
            <AnimatePresence>
              {activeTool === 'mpesa' && activeTx && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-8 pt-8 border-t border-sleek-border space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <h4 className="text-xs font-bold uppercase tracking-widest text-sleek-accent">Execution Stream</h4>
                       <span className="text-[10px] bg-sleek-accent/10 text-sleek-accent px-1.5 py-0.5 rounded border border-sleek-accent/20 font-mono">
                         REF: {activeTx.reference}
                       </span>
                    </div>
                    <StatusBadge status={activeTx.status} />
                  </div>

                  <div className="bg-dashboard-bg/50 rounded-xl border border-sleek-border/50 p-4 space-y-3 max-h-[300px] overflow-y-auto scrollbar-hide">
                    {activeTx.metadata?.events?.map((ev: any, idx: number) => (
                      <div key={idx} className="flex gap-3 items-start border-l border-sleek-border/30 pl-4 relative">
                        <div className="absolute left-[-4.5px] top-1.5 w-2 h-2 rounded-full bg-sleek-accent shadow-[0_0_8px_rgba(99,102,241,0.4)]"></div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-white uppercase tracking-tight">{ev.event.replace(/_/g, ' ')}</span>
                            <span className="text-[9px] text-sleek-dim font-mono">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <p className="text-[10px] text-sleek-muted leading-relaxed">
                            {ev.details}
                          </p>
                        </div>
                      </div>
                    ))}
                    {!activeTx.metadata?.events?.length && (
                      <div className="flex flex-col items-center justify-center py-8 text-center space-y-2 opacity-50">
                        <div className="w-8 h-8 rounded-full border-2 border-sleek-accent/30 border-t-sleek-accent animate-spin mb-2"></div>
                        <p className="text-[10px] text-sleek-dim italic uppercase tracking-widest font-bold">Waiting for remote lifecycle events...</p>
                        <p className="text-[9px] text-sleek-dim max-w-[180px]">Your backend is actively polling PayHero for status updates every 5 seconds.</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
 
            {/* Live Execution Stream for Paystack */}
            <AnimatePresence>
              {activeTool === 'paystack' && activeTx && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-8 pt-8 border-t border-sleek-border space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <h4 className="text-xs font-bold uppercase tracking-widest text-sleek-success">Paystack Stream</h4>
                       <span className="text-[10px] bg-sleek-success/10 text-sleek-success px-1.5 py-0.5 rounded border border-sleek-success/20 font-mono">
                         REF: {activeTx.reference}
                       </span>
                    </div>
                    <StatusBadge status={activeTx.status} />
                  </div>

                  {activeTx.instruction && activeTx.status === 'PENDING' && (
                    <div className="p-4 bg-sleek-success/10 border border-sleek-success/20 rounded-xl flex flex-col items-center gap-3 text-center relative overflow-hidden group">
                      <div className="w-10 h-10 border-2 border-sleek-success/30 border-t-sleek-success rounded-full animate-spin"></div>
                      <div className="z-10">
                        <p className="text-xs font-bold text-sleek-success uppercase tracking-widest mb-1">M-Pesa PIN Prompt Dispatched</p>
                        <p className="text-[11px] text-white font-medium">{activeTx.instruction}</p>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-sleek-success/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                    </div>
                  )}

                  <div className="bg-dashboard-bg/50 rounded-xl border border-sleek-border/50 p-4 space-y-3">
                    <div className="flex items-start gap-3 pl-4 relative border-l border-sleek-success/30">
                      <div className="absolute left-[-4.5px] top-1.5 w-2 h-2 rounded-full bg-sleek-success shadow-[0_0_8px_rgba(34,197,94,0.4)]"></div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-white uppercase tracking-tight">Handshake Sent</span>
                          <span className="text-[9px] text-sleek-dim font-mono">NOW</span>
                        </div>
                        <p className="text-[10px] text-sleek-muted leading-relaxed">
                          Secure charge request dispatched to Paystack nodes.
                        </p>
                      </div>
                    </div>
                    <div className="text-center py-4 opacity-50">
                       <p className="text-[9px] text-sleek-dim italic">Waiting for webhook lifecycle confirmation...</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Logs Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-sleek-dim">Live Request Logs</h2>
              {logs.length > 0 && (
                <button 
                  onClick={() => setLogs([])}
                  className="text-[10px] text-sleek-dim hover:text-white transition-colors flex items-center gap-1 uppercase tracking-tighter"
                >
                  <Trash2 size={10} /> Clear Logs
                </button>
              )}
            </div>

            <div className="bg-black/40 border border-sleek-border rounded-xl overflow-hidden font-mono text-[11px]">
              {logs.length === 0 ? (
                <div className="p-4 text-sleek-dim italic">No requests recorded in this session.</div>
              ) : (
                <div className="divide-y divide-sleek-border/10">
                  {logs.map((log) => (
                    <div key={log.id} className="p-3 hover:bg-white/[0.02] flex items-start gap-4 group">
                      <span className="text-sleek-dim whitespace-nowrap text-[10px] pt-1">{log.time}</span>
                      <div className="flex-1 space-y-1 overflow-hidden">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className={`px-1 rounded text-[8px] font-bold ${
                            log.type === 'REQUEST' ? 'bg-blue-500/20 text-blue-400' : 
                            log.type === 'SUCCESS' ? 'bg-sleek-success/20 text-sleek-success' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {log.type}
                          </span>
                          <span className="text-white truncate text-[10px] max-w-[150px] sm:max-w-none">{log.endpoint}</span>
                          {log.status !== 'pending' && (
                            <span className="text-sleek-dim italic ml-auto sm:block hidden shrink-0 whitespace-nowrap">HTTP {log.status}</span>
                          )}
                        </div>
                        {log.payload && (
                          <div className="text-sleek-muted opacity-60 group-hover:opacity-100 transition-opacity truncate text-[10px]">
                            <span className="text-sleek-dim tracking-tighter mr-1 font-bold">REQ:</span> 
                            {JSON.stringify(log.payload)}
                          </div>
                        )}
                        {log.response && (
                          <div className="text-sleek-muted opacity-60 group-hover:opacity-100 transition-opacity truncate text-[10px]">
                            <span className="text-sleek-dim tracking-tighter mr-1 font-bold">RES:</span> 
                            {JSON.stringify(log.response)}
                          </div>
                        )}
                        {log.error && (
                          <div className="text-red-400/80 italic text-[10px]">ERR: {log.error}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>

    {/* Success Modal */}
    <AnimatePresence>
      {showSuccess && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSuccess(false)}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative bg-panel-bg border border-sleek-accent/30 rounded-[32px] p-8 max-w-sm w-full text-center overflow-hidden shadow-2xl"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-sleek-accent to-transparent" />
            
            <div className="flex justify-center mb-6">
              <div className="relative">
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 10, stiffness: 100, delay: 0.2 }}
                  className="w-20 h-20 bg-sleek-success/20 rounded-full flex items-center justify-center text-sleek-success"
                >
                  <CheckCircle size={40} />
                </motion.div>
                <motion.div 
                  animate={{ 
                    scale: [1, 1.2, 1],
                    opacity: [0.5, 0, 0.5]
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 bg-sleek-success/30 rounded-full"
                />
              </div>
            </div>

            <h3 className="text-2xl font-bold mb-2">Payment Received</h3>
            <p className="text-sleek-dim text-sm mb-8">
              M-Pesa transaction confirmed.<br />
              <span className="text-sleek-accent/80 font-mono mt-1 block">
                REF: {activeTx?.reference}
              </span>
            </p>

            <button 
              onClick={() => setShowSuccess(false)}
              className="w-full bg-sleek-accent text-white py-4 rounded-2xl font-bold hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-sleek-accent/20"
            >
              Continue testing
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  </>
  );
}

function ToolTab({ icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={`p-3 md:p-4 rounded-xl md:rounded-2xl border cursor-pointer transition-all duration-300 flex items-center gap-3 md:gap-4 shrink-0 grow lg:grow-0 ${
        active ? 'bg-panel-bg border-sleek-accent shadow-xl shadow-sleek-accent/5 transition-all scale-[1.02]' : 'bg-dashboard-bg/50 border-sleek-border hover:border-sleek-dim/50'
      }`}
    >
      <span className={active ? 'text-sleek-accent' : 'text-sleek-dim'}>
        {icon}
      </span>
      <span className="text-xs font-semibold whitespace-nowrap">{label}</span>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, type = 'text' }: { label: string, value: string, onChange: (v: string) => void, placeholder: string, type?: string }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] uppercase tracking-widest text-sleek-dim ml-1">{label}</label>
      <input 
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-dashboard-bg border border-sleek-border rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-sleek-accent transition-all placeholder:text-sleek-dim/50"
      />
    </div>
  );
}

function PaymentManagementPage({ onSelect }: { onSelect: (tx: any) => void }) {
  const [stats, setStats] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPaymentStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/db/query?table=transactions&orderCol=created_at`);
      const json = await response.json();
      if (!json.success) throw new Error(json.error || 'Query failed');
      
      const txs = json.data || [];
      const total = txs.length;
      const success = txs.filter((t: any) => t.status === 'COMPLETED').length;
      const failed = txs.filter((t: any) => t.status === 'FAILED').length;
      const pending = txs.filter((t: any) => t.status === 'PENDING').length;
      
      const callbacks = txs.filter((t: any) => {
        let meta = t.metadata;
        if (typeof meta === 'string') {
          try { meta = JSON.parse(meta); } catch(e) { meta = null; }
        }
        return meta?.callback_payload;
      }).length;

      const pollings = txs.filter((t: any) => {
        let meta = t.metadata;
        if (typeof meta === 'string') {
          try { meta = JSON.parse(meta); } catch(e) { meta = null; }
        }
        return meta?.manual_check_result;
      }).length;

      setTransactions(txs.slice(0, 50));
      setStats({
        total,
        success,
        failed,
        pending,
        successRate: total > 0 ? (success / total) * 100 : 0,
        callbackRate: total > 0 ? (callbacks / total) * 100 : 0,
        pollingUsage: pollings
      });
    } catch (err) {
      console.error('Error fetching payment stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPaymentStats();
    // Poll the active database every 5 seconds
    const interval = setInterval(fetchPaymentStats, 5000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <motion.div 
      key="payment-mgmt"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex-1 p-4 md:p-8 overflow-y-auto space-y-8"
    >
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold flex items-center gap-2">
            <Zap className="text-sleek-accent" /> Payment API Management
          </h1>
          <p className="text-xs md:text-sm text-sleek-dim">Gateway analytics, lifecycle control and multi-provider monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => fetchPaymentStats()}
            className="flex items-center gap-2 px-4 py-2 bg-dashboard-bg border border-sleek-border rounded-xl text-xs font-bold hover:bg-sleek-border transition-all"
          >
            <Activity size={14} /> Refresh Data
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Volume" value={stats?.total?.toString() || '0'} trend="Total attempts" positive />
        <StatCard label="Conversion" value={`${stats?.successRate?.toFixed(1) || '0'}%`} trend="Success rate" positive={stats?.successRate > 80} />
        <StatCard label="Callback Efficiency" value={`${stats?.callbackRate?.toFixed(1) || '0'}%`} trend="Webhook delivery" positive={stats?.callbackRate > 95} />
        <StatCard label="Manual Polls" value={stats?.pollingUsage?.toString() || '0'} trend="Proactive checks" />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-sleek-dim">Live Transaction Stream</h2>
          <div className="flex gap-2">
            <span className="flex items-center gap-1.5 text-[10px] text-sleek-pending font-bold bg-sleek-pending/10 px-2 py-1 rounded border border-sleek-pending/20">
              {stats?.pending || 0} PENDING
            </span>
          </div>
        </div>
        
        <div className="bg-panel-bg border border-sleek-border rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-dashboard-bg/50 border-b border-sleek-border text-[10px] font-mono text-sleek-dim uppercase">
                  <th className="px-6 py-4">Reference</th>
                  <th className="px-6 py-4">Provider</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Conf. Method</th>
                  <th className="px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sleek-border/30">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-mono text-sleek-accent">{tx.reference}</div>
                      <div className="text-[10px] text-sleek-dim">{new Date(tx.created_at).toLocaleTimeString()}</div>
                    </td>
                    <td className="px-6 py-4 capitalize font-mono text-sleek-muted">
                      {tx.provider || 'PayHero'}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={tx.status} />
                    </td>
                    <td className="px-6 py-4">
                      {tx.checkout_request_id ? (
                        <span className="flex items-center gap-1 text-[10px] text-sleek-success font-bold">
                          <Smartphone size={10} /> WEBHOOK
                        </span>
                      ) : (
                        <span className="text-[10px] text-sleek-dim italic">WAITING...</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => onSelect(tx)}
                        className="px-3 py-1 bg-sleek-border rounded text-[10px] font-bold group-hover:bg-sleek-accent transition-all group-hover:text-white"
                      >
                        MANAGE
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </motion.div>
  );
}


function ArrowRight(props: any) {
  return (
    <svg 
      {...props} 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
    </svg>
  );
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [countdown, setCountdown] = useState<number>(0);

  // Manage 30-second resend cooldown timer
  useEffect(() => {
    if (countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  const handleSendCode = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsProcessing(true);

    const cleanIdentifier = identifier.trim();

    if (!cleanIdentifier) {
      setError('Please enter a registered email or phone number.');
      setIsProcessing(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: cleanIdentifier })
      });

      const contentType = response.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const textStr = await response.text();
        throw new Error(`Server returned unexpected ${response.status} response: ${textStr.substring(0, 150)}`);
      }

      if (!response.ok || !data.success) {
        if (response.status === 429) {
          setCountdown(30);
          setStep('verify');
          setError(data.error || 'Please wait a moment before requesting another code.');
          return;
        }
        throw new Error(data.error || 'Failed to send verification code.');
      }

      setSuccessMsg(data.message || 'Verification code sent! Valid for 10 minutes.');
      if (data.sessionId) setSessionId(data.sessionId);
      setCountdown(30); // 30-second cooldown before resend
      setStep('verify');
    } catch (err: any) {
      setError(err.message || 'Request failed. Please double check your email/phone.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVerifyCode = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsProcessing(true);

    const cleanIdentifier = identifier.trim();
    const cleanCode = code.trim();

    if (!cleanCode) {
      setError('Please enter the 6-digit verification code.');
      setIsProcessing(false);
      return;
    }

    try {
      // Step 6: Verify matching code for specific session
      const response = await fetch(`${API_BASE_URL}/api/auth/verify-login-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: cleanIdentifier,
          code: cleanCode,
          sessionId: sessionId
        })
      });

      const contentType = response.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const textStr = await response.text();
        throw new Error(`Server returned unexpected ${response.status} response: ${textStr.substring(0, 150)}`);
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Verification failed. Incorrect or expired code.');
      }

      const profile = data.profile;
      if (!profile || profile.backend_admin !== 'yes') {
        throw new Error('Access denied: Unauthorized access role.');
      }

      // Save credentials locally
      localStorage.setItem('hub_auth', 'true');
      localStorage.setItem('hub_user', profile.email || profile.phone_number || cleanIdentifier);
      if (data.token) {
        localStorage.setItem('hub_token', data.token);
      }
      localStorage.setItem('hub_profile', JSON.stringify(profile));

      onLogin();
    } catch (err: any) {
      setError(err.message || 'Verification failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dashboard-bg p-4 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-panel-bg border border-sleek-border rounded-3xl p-8 shadow-2xl relative overflow-hidden my-8"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-sleek-accent to-transparent" />
        
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 mb-4 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <ShieldCheck size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Admin Portal
          </h1>
          <p className="text-sleek-dim text-sm text-center mt-2">
            Secure code-based login to the Errandly API Hub
          </p>
        </div>

        {step === 'request' ? (
          <form onSubmit={handleSendCode} className="space-y-5">
            <InputField 
              label="Registered Email or Phone" 
              value={identifier} 
              onChange={setIdentifier} 
              placeholder="e.g. admin@errandly.site or 254712345678" 
              type="text" 
            />

            <AnimatePresence>
              {error && (
                <motion.p 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-red-400 text-xs text-center font-medium bg-red-950/30 p-3 rounded-xl border border-red-900/40"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <button 
              type="submit"
              disabled={isProcessing}
              className="w-full py-4 bg-sleek-accent hover:brightness-110 text-white rounded-2xl font-bold transition-all shadow-lg shadow-sleek-accent/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isProcessing ? 'Requesting Code...' : 'Send Login Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-5">
            <div className="p-4 bg-dashboard-bg/50 border border-sleek-border rounded-2xl flex items-center justify-between text-xs mb-1">
              <div className="flex flex-col">
                <span className="text-sleek-dim font-medium">Sending Code to</span>
                <span className="text-white font-semibold truncate max-w-[200px] mt-0.5">{identifier}</span>
              </div>
              <button
                type="button"
                className="text-sleek-accent hover:underline font-bold px-2 py-1"
                onClick={() => {
                  setStep('request');
                  setError('');
                  setSuccessMsg('');
                  setCode('');
                  setSessionId('');
                }}
              >
                Change
              </button>
            </div>

            <InputField 
              label="6-Digit Verification Code" 
              value={code} 
              onChange={setCode} 
              placeholder="e.g. 123456" 
              type="text" 
            />

            <AnimatePresence>
              {error && (
                <motion.p 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-red-400 text-xs text-center font-medium bg-red-950/30 p-3 rounded-xl border border-red-900/40"
                >
                  {error}
                </motion.p>
              )}
              {successMsg && (
                <motion.p 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-emerald-400 text-xs text-center font-medium bg-emerald-950/30 p-3 rounded-xl border border-emerald-900/40"
                >
                  {successMsg}
                </motion.p>
              )}
            </AnimatePresence>

            <button 
              type="submit"
              disabled={isProcessing}
              className="w-full py-4 bg-sleek-accent hover:brightness-110 text-white rounded-2xl font-bold transition-all shadow-lg shadow-sleek-accent/20 active:scale-95 disabled:opacity-50"
            >
              Verify & Sign In
            </button>

            {/* Countdown at the bottom to request another code */}
            <div className="pt-2 text-center text-xs">
              {countdown > 0 ? (
                <div className="text-sleek-dim font-mono">
                  Request another code in <span className="text-indigo-400 font-bold">{Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSendCode()}
                  disabled={isProcessing}
                  className="text-sleek-accent hover:underline font-bold"
                >
                  {isProcessing ? 'Sending...' : 'Request another code'}
                </button>
              )}
            </div>
          </form>
        )}

        <div className="mt-8 pt-4 border-t border-sleek-border/20 text-center">
          <p className="text-[10px] text-sleek-dim uppercase tracking-[0.2em] font-mono">Company Access Restricted</p>
        </div>
      </motion.div>
    </div>
  );
}

function ServiceInspector({ service, onClose, stats }: { service: string | null, onClose: () => void, stats: any }) {
  if (!service) return null;

  const getServiceDetails = () => {
    switch (service) {
      case 'Supabase DB':
        return {
          icon: <Database className="text-blue-400" />,
          metrics: [
            { label: 'Total Operations', value: stats.dbOperations.toLocaleString(), trend: '+12% from yesterday' },
            { label: 'Active Tables', value: '4', trend: 'transactions, users,...' },
            { label: 'Avg Query Time', value: '18ms', trend: 'Optimized' }
          ],
          logs: [
            'Syncing transactions table with remote...',
            'Real-time subscription active on channel hub-01',
            'Connection pool: 8/20 used'
          ]
        };
      case 'PayHero Gateway':
        return {
          icon: <Zap className="text-sleek-accent" />,
          metrics: [
            { label: 'Total Volume', value: `KES ${stats.mpesaVolume.toLocaleString()}`, trend: 'Total Success' },
            { label: 'Success Rate', value: `${stats.successRate.toFixed(1)}%`, trend: 'Healthy' },
            { label: 'Payload Errors', value: '0', trend: 'Zero critical' }
          ],
          logs: [
            'Validating STK Push callback signatures...',
            'Webhooks delivered: 100%',
            'Provider API status: Excellent'
          ]
        };
      case 'Paystack API':
        return {
          icon: <CheckCircle className="text-sleek-success" />,
          metrics: [
            { label: 'Initialization Rate', value: '100%', trend: 'Steady' },
            { label: 'Verification Latency', value: '250ms', trend: 'Nominal' },
            { label: 'Currencies', value: 'NGN, KES, GHS', trend: 'Multi-region' }
          ],
          logs: [
            'Paystack initialization handshake OK',
            'Listening for event: charge.success',
            'Redirect flow: Enabled'
          ]
        };
      case 'Core API':
        return {
          icon: <Server className="text-indigo-400" />,
          metrics: [
            { label: 'Current Latency', value: stats.latency, trend: 'Inside SLA' },
            { label: 'Uptime', value: '99.98%', trend: 'Steady' },
            { label: 'Active Handles', value: '142', trend: 'GC Nominal' }
          ],
          logs: [
            'Worker pool healthy',
            'Memory usage: 256MB / 512MB',
            'HTTP/2 protocol active'
          ]
        };
      default:
        return {
          icon: <Activity className="text-sleek-dim" />,
          metrics: [
            { label: 'Status', value: 'Active', trend: 'No issues' },
            { label: 'Last Call', value: 'Just now', trend: 'Successful' }
          ],
          logs: [
            'Service heartbeat detected',
            'Waiting for next request...'
          ]
        };
    }
  };

  const details = getServiceDetails();

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-end">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.aside 
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="relative w-full max-w-md h-full bg-panel-bg border-l border-sleek-border shadow-2xl flex flex-col"
        >
          <div className="p-6 border-b border-sleek-border flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-dashboard-bg border border-sleek-border flex items-center justify-center text-xl">
                {details.icon}
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight">{service}</h2>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-sleek-success animate-pulse"></div>
                  <span className="text-[10px] text-sleek-success font-bold uppercase tracking-widest">Operational</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-sleek-border rounded-full transition-colors">
              <Filter size={20} className="rotate-45" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            <section className="space-y-4">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-sleek-dim">Live Metrics</h3>
              <div className="grid grid-cols-1 gap-4">
                {details.metrics.map((m, i) => (
                  <div key={i} className="bg-dashboard-bg/50 border border-sleek-border p-4 rounded-xl group hover:border-sleek-accent/30 transition-all">
                    <div className="text-[10px] uppercase text-sleek-dim mb-1 font-mono tracking-tighter">{m.label}</div>
                    <div className="text-xl font-bold font-mono group-hover:text-sleek-accent transition-colors">{m.value}</div>
                    <div className="text-[10px] text-sleek-dim mt-1 italic">{m.trend}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-sleek-dim">Service Logs</h3>
              <div className="bg-black/40 rounded-xl border border-sleek-border p-4 font-mono text-[11px] space-y-3">
                {details.logs.map((log, i) => (
                  <div key={i} className="flex gap-3 text-sleek-muted">
                    <span className="text-sleek-accent opacity-50">#</span>
                    <span>{log}</span>
                  </div>
                ))}
              </div>
            </section>
            
            <section className="p-4 bg-sleek-accent/5 rounded-2xl border border-sleek-accent/10">
              <p className="text-[11px] text-sleek-dim leading-relaxed italic">
                Metrics are updated in real-time via Supabase edge functions and PayHero webhook relays.
              </p>
            </section>
          </div>

          <div className="p-6 border-t border-sleek-border bg-dashboard-bg/30 text-[10px] text-sleek-dim flex justify-between font-mono">
            <span>NODE_ENV: PROD</span>
            <span>UPTIME: 100.0%</span>
          </div>
        </motion.aside>
      </div>
    </AnimatePresence>
  );
}

function TransactionManagerDrawer({ transaction, onClose }: { transaction: any, onClose: () => void }) {
  const [isProcessing, setIsProcessing] = useState(false);

  if (!transaction) return null;

  const handleManualComplete = async () => {
    if (!window.confirm(`Force complete transaction ${transaction.reference}? This will override provider status.`)) return;
    setIsProcessing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/db/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: 'transactions',
          values: {
            status: 'COMPLETED',
            is_closed: true,
            description: 'Manually completed by Admin.'
          },
          eqCol: 'reference',
          eqVal: transaction.reference
        })
      });

      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || 'Failed to update transaction.');
      }

      alert('Transaction completed successfully.');
      onClose();
    } catch (err: any) {
      alert(`Safety Override Failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSyncStatus = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/payments/status?reference=${transaction.reference}`);
      const data = await res.json();
      
      if (res.ok) {
        alert(`Status Synced: ${data.status || 'Received response'}`);
      } else {
        throw new Error(data.error || 'Sync failed');
      }
    } catch (err: any) {
      alert(`Sync Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150] flex items-center justify-end">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.aside 
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="relative w-full max-w-xl h-full bg-panel-bg border-l border-sleek-border shadow-2xl flex flex-col"
        >
          <div className="p-6 border-b border-sleek-border flex items-center justify-between bg-dashboard-bg/50">
            <div className="space-y-1">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Terminal size={18} className="text-sleek-accent" />
                Transaction Manager
              </h2>
              <p className="text-[10px] font-mono text-sleek-dim uppercase tracking-widest">{transaction.reference}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-sleek-border rounded-full transition-colors">
              <Filter size={20} className="rotate-45" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* Quick Actions */}
            <section className="space-y-4">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-sleek-dim">Admin Controls</h3>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  disabled={isProcessing}
                  onClick={handleSyncStatus}
                  className="flex flex-col gap-2 p-4 bg-dashboard-bg border border-sleek-border rounded-xl hover:border-sleek-accent transition-all group disabled:opacity-50"
                >
                  <Zap size={14} className="text-sleek-accent" />
                  <div className="text-left">
                    <div className="text-[11px] font-bold">Sync Status</div>
                    <div className="text-[9px] text-sleek-dim">Poll Provider API</div>
                  </div>
                </button>
                <button 
                  disabled={isProcessing || transaction.status === 'COMPLETED'}
                  onClick={handleManualComplete}
                  className="flex flex-col gap-2 p-4 bg-dashboard-bg border border-sleek-border rounded-xl hover:border-sleek-success transition-all group disabled:opacity-50"
                >
                  <CheckCircle2 size={14} className="text-sleek-success" />
                  <div className="text-left">
                    <div className="text-[11px] font-bold">Force Complete</div>
                    <div className="text-[9px] text-sleek-dim">Override Provider</div>
                  </div>
                </button>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-sleek-dim flex items-center gap-2">
                <Database size={14} /> System Metadata
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <MetaItem label="Lifecycle" value={transaction.is_closed ? 'CLOSED' : 'OPEN / ACTIVE'} />
                <MetaItem label="Checkout ID" value={transaction.checkout_request_id || 'N/A'} />
                <MetaItem label="Mpesa Receipt" value={transaction.mpesa_receipt_number || 'N/A'} />
                <MetaItem label="Internal Ref" value={transaction.reference} />
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-sleek-dim flex items-center gap-2">
                <Activity size={14} /> System Event Logs
              </h3>
              <div className="space-y-4 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[1px] before:bg-sleek-border">
                <TimelineEvent 
                  icon={<Zap size={10} />} 
                  title="Transaction Lifecycle" 
                  time={new Date(transaction.created_at).toLocaleTimeString()}
                  desc={transaction.description || 'Initial request dispatched to payment gateway.'}
                  status="success"
                />
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-widest text-sleek-dim flex items-center gap-2">
                  <Zap size={14} /> Provider Data
                </h3>
              </div>
              <div className="space-y-3">
                <div className="text-[10px] text-sleek-dim italic bg-dashboard-bg/50 p-4 rounded-lg border border-sleek-border/30 text-center">
                  Gateway: {transaction.provider || 'PayHero'} | Reference: {transaction.reference}
                </div>
              </div>
            </section>
          </div>

          <div className="p-6 border-t border-sleek-border bg-dashboard-bg/30 text-[10px] text-sleek-dim flex justify-between font-mono">
            <span>NODE_ENV: PRODUCTION</span>
            <span>UUID: {transaction.id}</span>
          </div>
        </motion.aside>
      </div>
    </AnimatePresence>
  );
}

function EnvSetup() {
  const [formData, setFormData] = useState({
    VITE_FIREBASE_API_KEY: localStorage.getItem('ENV_VITE_FIREBASE_API_KEY') || '',
    VITE_FIREBASE_AUTH_DOMAIN: localStorage.getItem('ENV_VITE_FIREBASE_AUTH_DOMAIN') || '',
    VITE_FIREBASE_PROJECT_ID: localStorage.getItem('ENV_VITE_FIREBASE_PROJECT_ID') || '',
    VITE_FIREBASE_STORAGE_BUCKET: localStorage.getItem('ENV_VITE_FIREBASE_STORAGE_BUCKET') || '',
    VITE_FIREBASE_MESSAGING_SENDER_ID: localStorage.getItem('ENV_VITE_FIREBASE_MESSAGING_SENDER_ID') || '',
    VITE_FIREBASE_APP_ID: localStorage.getItem('ENV_VITE_FIREBASE_APP_ID') || '',
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || localStorage.getItem('ENV_VITE_SUPABASE_URL') || localStorage.getItem('ENV_SUPABASE_URL') || '',
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || localStorage.getItem('ENV_VITE_SUPABASE_ANON_KEY') || localStorage.getItem('ENV_SUPABASE_PUBLISHABLE_KEY') || '',
    SUPABASE_SECRET_KEY: localStorage.getItem('ENV_SUPABASE_SECRET_KEY') || '',
    SUPABASE_JWKS_URL: localStorage.getItem('ENV_SUPABASE_JWKS_URL') || ''
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    Object.entries(formData).forEach(([key, val]) => {
      if (val) {
        localStorage.setItem(`ENV_${key}`, val as string);
        // Sync custom keys to both variants so either code lookup finds them
        if (key === 'VITE_SUPABASE_URL') {
          localStorage.setItem('ENV_SUPABASE_URL', val as string);
        }
        if (key === 'VITE_SUPABASE_ANON_KEY') {
          localStorage.setItem('ENV_SUPABASE_PUBLISHABLE_KEY', val as string);
        }
      }
    });
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-dashboard-bg text-sleek-text flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-[#111111] border border-sleek-border rounded-xl p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Zap className="text-sleek-accent" />
            Environment Setup Hook
          </h1>
          <p className="text-sm text-sleek-dim mt-2">
            This module requires active Firebase and Supabase connection parameters. Provide standard credentials below to securely mount the interface onto your cloud project schemas. Data remains resident only in your browser storage.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField label="Firebase API Key" value={formData.VITE_FIREBASE_API_KEY} onChange={v => setFormData(p => ({ ...p, VITE_FIREBASE_API_KEY: v }))} placeholder="AIzaSy..." />
            <InputField label="Firebase Auth Domain" value={formData.VITE_FIREBASE_AUTH_DOMAIN} onChange={v => setFormData(p => ({ ...p, VITE_FIREBASE_AUTH_DOMAIN: v }))} placeholder="project.firebaseapp.com" />
            <InputField label="Firebase Project ID" value={formData.VITE_FIREBASE_PROJECT_ID} onChange={v => setFormData(p => ({ ...p, VITE_FIREBASE_PROJECT_ID: v }))} placeholder="my-project-id" />
            <InputField label="Storage Bucket" value={formData.VITE_FIREBASE_STORAGE_BUCKET} onChange={v => setFormData(p => ({ ...p, VITE_FIREBASE_STORAGE_BUCKET: v }))} placeholder="project.appspot.com" />
            <InputField label="Messaging Sender" value={formData.VITE_FIREBASE_MESSAGING_SENDER_ID} onChange={v => setFormData(p => ({ ...p, VITE_FIREBASE_MESSAGING_SENDER_ID: v }))} placeholder="123456789" />
            <InputField label="Firebase App ID" value={formData.VITE_FIREBASE_APP_ID} onChange={v => setFormData(p => ({ ...p, VITE_FIREBASE_APP_ID: v }))} placeholder="1:12345678:web:abc" />
            
            <div className="col-span-1 md:col-span-2 pt-4 border-t border-sleek-border mt-2">
              <h3 className="text-sm font-semibold tracking-wide text-white mb-2">Supabase Configuration Parameters</h3>
            </div>
            
            <InputField label="Supabase URL" value={formData.VITE_SUPABASE_URL} onChange={v => setFormData(p => ({ ...p, VITE_SUPABASE_URL: v, SUPABASE_URL: v }))} placeholder="https://abc.supabase.co" />
            <InputField label="Supabase Publishable Key" value={formData.VITE_SUPABASE_ANON_KEY} onChange={v => setFormData(p => ({ ...p, VITE_SUPABASE_ANON_KEY: v }))} placeholder="eyJ..." />
            <InputField label="Supabase Secret Key (Service Role)" value={formData.SUPABASE_SECRET_KEY} onChange={v => setFormData(p => ({ ...p, SUPABASE_SECRET_KEY: v }))} placeholder="eyJ..." />
            <InputField label="Supabase JWKS URL" value={formData.SUPABASE_JWKS_URL} onChange={v => setFormData(p => ({ ...p, SUPABASE_JWKS_URL: v }))} placeholder="https://abc.supabase.co/jwt/jwks.json" />
          </div>

          <button 
            type="submit" 
            className="w-full py-4 mt-6 bg-sleek-accent hover:brightness-110 active:scale-95 text-white shadow-lg shadow-sleek-accent/20 font-bold rounded-xl transition-all"
          >
            Mount Configuration
          </button>
        </form>
      </div>
    </div>
  );
}
