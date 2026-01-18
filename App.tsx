
import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Zap, 
  History as HistoryIcon, 
  Settings as SettingsIcon, 
  FileText, 
  ShieldAlert, 
  Menu, 
  LogOut, 
  Database,
  User,
  Users,
  CheckCircle2,
  AlertCircle,
  ShieldOff,
  Activity
} from 'lucide-react';
import { Equipment, Reading, UserAccount, ThresholdSettings, View, HealthStatus, GlobalHealthStats } from './types';
import Dashboard from './components/Dashboard';
import EquipmentManager from './components/EquipmentManager';
import DataEntry from './components/DataEntry';
import HistoryView from './components/HistoryView';
import AIDiagnostics from './components/AIDiagnostics';
import SettingsView from './components/SettingsView';
import ReportsView from './components/ReportsView';
import UserManagement from './components/UserManagement';

const INITIAL_THRESHOLD: ThresholdSettings = {
  poorLimit: 300,
  criticalLimit: 500
};

const DEFAULT_ADMIN: UserAccount = {
  id: '0',
  username: 'admin',
  password: 'admin123',
  role: 'Admin'
};

const App: React.FC = () => {
  const [users, setUsers] = useState<UserAccount[]>(() => {
    const saved = localStorage.getItem('la_users');
    return saved ? JSON.parse(saved) : [DEFAULT_ADMIN];
  });

  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    const saved = localStorage.getItem('la_current_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [equipments, setEquipments] = useState<Equipment[]>(() => {
    const saved = localStorage.getItem('la_equipments');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [readings, setReadings] = useState<Reading[]>(() => {
    const saved = localStorage.getItem('la_readings');
    return saved ? JSON.parse(saved) : [];
  });

  const [settings, setSettings] = useState<ThresholdSettings>(() => {
    const saved = localStorage.getItem('la_settings');
    return saved ? JSON.parse(saved) : INITIAL_THRESHOLD;
  });

  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchTerm] = useState(''); // This searchTerm is not used in App.tsx
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    localStorage.setItem('la_users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem('la_current_user', JSON.stringify(currentUser));
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('la_equipments', JSON.stringify(equipments));
  }, [equipments]);

  useEffect(() => {
    localStorage.setItem('la_readings', JSON.stringify(readings));
  }, [readings]);

  useEffect(() => {
    localStorage.setItem('la_settings', JSON.stringify(settings));
  }, [settings]);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const user = users.find(u => u.username === loginForm.username && u.password === loginForm.password);
    if (user) {
      setCurrentUser(user);
      setLoginError('');
      setLoginForm({ username: '', password: '' });
    } else {
      setLoginError('Invalid username or password');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentView('dashboard');
  };

  // Helper function to get latest reading for a given equipment ID
  const getLatestReadingApp = (eqId: string) => {
    return readings
      .filter(r => r.equipmentId === eqId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  };

  // Helper function to get status for equipment
  const getStatusApp = (eq: Equipment, latest?: Reading): HealthStatus => {
    if (eq.statusOverride) return eq.statusOverride as HealthStatus;
    if (!latest) return 'Satisfactory'; // Default for equipment with no readings
    const val = latest.correctedResistiveCurrent;
    if (val === 0) return 'Probe Failure'; // Assuming 0 implies failure
    if (val > settings.criticalLimit) return 'Critical';
    if (val > settings.poorLimit) return 'Poor';
    return 'Satisfactory';
  };

  // Memoized global health statistics for the header
  const globalHealthStats: GlobalHealthStats = useMemo(() => {
    let satisfactory = 0;
    let poor = 0;
    let critical = 0;
    let probeFailure = 0;

    equipments.forEach(eq => {
      const latest = getLatestReadingApp(eq.id);
      const status = getStatusApp(eq, latest);
      switch (status) {
        case 'Satisfactory':
          satisfactory++;
          break;
        case 'Poor':
          poor++;
          break;
        case 'Critical':
          critical++;
          break;
        case 'Probe Failure':
          probeFailure++;
          break;
        default:
          break;
      }
    });

    return {
      totalAssets: equipments.length,
      satisfactory,
      poor,
      critical,
      probeFailure,
      atRisk: poor + critical + probeFailure,
    };
  }, [equipments, readings, settings]);

  const healthyPercent = useMemo(() => {
    if (globalHealthStats.totalAssets === 0) return 0;
    return ((globalHealthStats.satisfactory / globalHealthStats.totalAssets) * 100).toFixed(1);
  }, [globalHealthStats]);

  const atRiskPercent = useMemo(() => {
    if (globalHealthStats.totalAssets === 0) return 0;
    return (((globalHealthStats.atRisk) / globalHealthStats.totalAssets) * 100).toFixed(1);
  }, [globalHealthStats]);


  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-600 rounded-3xl shadow-2xl mb-6 shadow-blue-500/30">
              <Zap className="text-white" size={40} />
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">NVA ArresterGuard with AI</h1>
            <p className="text-slate-400 mt-2">Professional Leakage Monitoring System</p>
          </div>

          <form onSubmit={handleLogin} className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
            <div className="space-y-4">
              {loginError && (
                <div className="p-3 bg-red-500/20 border border-red-500/30 text-red-400 text-sm rounded-lg text-center font-medium">
                  {loginError}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Username</label>
                <input 
                  autoFocus
                  required
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                  value={loginForm.username}
                  onChange={e => setLoginForm({...loginForm, username: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Password</label>
                <input 
                  required
                  type="password"
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                  value={loginForm.password}
                  onChange={e => setLoginForm({...loginForm, password: e.target.value})}
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold text-lg shadow-xl shadow-blue-500/20 transition-all active:scale-[0.98]"
              >
                Sign In
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const isAdmin = currentUser.role === 'Admin';
  const isTechnician = currentUser.role === 'Technician';
  // Technicians have write access to Equipment, Data Entry, and Dashboard actions
  const hasWriteAccess = isAdmin || isTechnician;

  // Role 'Write' implies Admin OR Technician
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, role: 'All' },
    { id: 'equipment', label: 'Equipment Detail', icon: Database, role: 'All' },
    { id: 'readings', label: 'Batch Data Entry', icon: Zap, role: 'Write' },
    { id: 'history', label: 'History Archive', icon: HistoryIcon, role: 'All' },
    { id: 'ai-diagnostic', label: 'AI Diagnostic', icon: ShieldAlert, role: 'All' },
    { id: 'reports', label: 'Report Generator', icon: FileText, role: 'All' },
    { id: 'settings', label: 'Limit Settings', icon: SettingsIcon, role: 'Admin' },
    { id: 'user-management', label: 'User Management', icon: Users, role: 'Admin' },
  ];

  const filteredMenuItems = menuItems.filter(item => {
    if (item.role === 'All') return true;
    if (item.role === 'Admin') return isAdmin;
    if (item.role === 'Write') return hasWriteAccess;
    return false;
  });

  return (
    <div className="h-screen flex overflow-hidden bg-slate-50">
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-300 transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0 flex flex-col border-r border-slate-800 shrink-0
      `}>
        <div className="p-6 flex items-center gap-2 mb-4">
          <Zap className="text-yellow-400" size={32} />
          <span className="font-extrabold text-xl text-white">NVA ArresterGuard with AI</span>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto no-scrollbar">
          {filteredMenuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setCurrentView(item.id as View);
                setIsSidebarOpen(false);
              }}
              className={`
                flex items-center w-full px-4 py-3 rounded-lg text-sm font-medium transition-colors
                ${currentView === item.id 
                  ? 'bg-blue-600 text-white shadow-lg' 
                  : 'hover:bg-slate-800 hover:text-white'}
              `}
            >
              <item.icon size={20} className="mr-3" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
          <div className="flex items-center justify-between bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
            <div className="flex flex-col">
              <span className="text-white text-sm font-bold truncate max-w-[120px]">{currentUser.username}</span>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isAdmin ? 'text-blue-400' : isTechnician ? 'text-emerald-400' : 'text-slate-500'}`}>
                {currentUser.role} Account
              </span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
          {isAdmin && (
            <div className="mt-2 text-[10px] text-slate-600 text-center">
              Copyright 2026 by N.V Allonar
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="shrink-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button className="md:hidden p-2 text-slate-600" onClick={toggleSidebar}>
              <Menu size={24} />
            </button>
            
            {/* Health Monitoring Percentages */}
            <div className="flex flex-col">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400 mb-1">
                 <Activity size={12} /> System Health Monitor
              </div>
              <div className="flex items-center gap-3">
                 <div className="flex items-center gap-1.5" title="Assets in Satisfactory Condition">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"></div>
                    <span className="text-sm font-extrabold text-slate-700">{healthyPercent}% Healthy</span>
                 </div>
                 <div className="w-px h-3 bg-slate-200"></div>
                 <div className="flex items-center gap-1.5" title="Assets needing attention (Poor, Critical, Probe Fail)">
                    <div className="w-2 h-2 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50 animate-pulse"></div>
                    <span className="text-sm font-extrabold text-slate-700">{atRiskPercent}% At Risk</span>
                 </div>
              </div>
              <div className="w-full h-1 bg-slate-100 rounded-full mt-1 overflow-hidden flex">
                 <div style={{ width: `${healthyPercent}%` }} className="bg-emerald-500 h-full transition-all duration-500"></div>
                 <div style={{ width: `${atRiskPercent}%` }} className="bg-rose-500 h-full transition-all duration-500"></div>
              </div>
            </div>
          </div>
          
          {/* Global Health Status in Header */}
          <div className="flex items-center gap-4 ml-auto">
            <div className="hidden sm:flex bg-slate-100 p-2 rounded-xl items-center gap-2 text-xs font-medium text-slate-700">
              <span className="text-[10px] font-bold uppercase tracking-wide">Total Assets:</span>
              <span className="font-bold text-slate-900">{globalHealthStats.totalAssets}</span>
            </div>
            <div className={`bg-white border p-2 rounded-xl flex items-center gap-2 text-xs font-medium 
                          ${globalHealthStats.atRisk > 0 ? 'border-rose-300 text-rose-700 shadow-sm' : 'border-emerald-200 text-emerald-700 shadow-sm'}`}>
              {globalHealthStats.atRisk > 0 ? (
                <>
                  <AlertCircle size={16} className="text-rose-500" />
                  <span className="text-[10px] font-bold uppercase tracking-wide">Action Required</span>
                  <span className="font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded text-[10px]">{globalHealthStats.atRisk}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  <span className="text-[10px] font-bold uppercase tracking-wide">All Good!</span>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            {currentView === 'dashboard' && (
              <Dashboard 
                equipments={equipments} 
                setEquipments={setEquipments}
                readings={readings}
                setReadings={setReadings} 
                settings={settings} 
                searchTerm={searchTerm} 
                isAdmin={hasWriteAccess}
              />
            )}
            {currentView === 'equipment' && (
              <EquipmentManager 
                equipments={equipments} 
                setEquipments={setEquipments} 
                readings={readings}
                setReadings={setReadings}
                isAdmin={hasWriteAccess} 
              />
            )}
            {currentView === 'readings' && (
              <DataEntry 
                equipments={equipments} 
                setEquipments={setEquipments}
                addReading={(r) => setReadings(prev => [r, ...prev])} 
                setReadings={setReadings}
                isAdmin={hasWriteAccess}
              />
            )}
            {currentView === 'history' && (
              <HistoryView 
                readings={readings} 
                setReadings={setReadings} 
                equipments={equipments}
                setEquipments={setEquipments} 
                isAdmin={hasWriteAccess}
              />
            )}
            {currentView === 'ai-diagnostic' && (
              <AIDiagnostics 
                equipments={equipments} 
                readings={readings} 
                settings={settings} 
              />
            )}
            {currentView === 'settings' && (
              <SettingsView 
                settings={settings} 
                setSettings={setSettings} 
                isAdmin={isAdmin}
              />
            )}
            {currentView === 'reports' && (
              <ReportsView 
                equipments={equipments} 
                readings={readings} 
                setEquipments={setEquipments}
                setReadings={setReadings}
                settings={settings}
              />
            )}
            {currentView === 'user-management' && isAdmin && (
              <UserManagement 
                users={users}
                setUsers={setUsers}
                currentUser={currentUser}
                setCurrentUser={setCurrentUser}
                setEquipments={setEquipments}
                setReadings={setReadings}
                setSettings={setSettings}
                initialThreshold={INITIAL_THRESHOLD}
                defaultAdmin={DEFAULT_ADMIN}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
