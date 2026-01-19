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
  Users,
  CheckCircle2,
  AlertCircle, 
  Activity,
  Cloud,
  CloudOff,
  Loader2,
  QrCode,
  X,
  ArrowRight,
  Edit,
  BarChart3
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
import { supabase } from './services/supabaseClient';
import { Html5Qrcode } from 'html5-qrcode';

const INITIAL_THRESHOLD: ThresholdSettings = {
  poorLimit: 50,
  criticalLimit: 100
};

const DEFAULT_ADMIN: UserAccount = {
  id: '0',
  username: 'admin',
  password: 'admin123',
  role: 'Admin'
};

const App: React.FC = () => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  
  // Initialize currentUser from localStorage
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    try {
      const stored = localStorage.getItem('arrester_user');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      console.error("Failed to restore session", e);
      return null;
    }
  });

  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [settings, setSettings] = useState<ThresholdSettings>(INITIAL_THRESHOLD);
  const [loading, setLoading] = useState(true);

  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  // Global QR State
  const [showGlobalScanner, setShowGlobalScanner] = useState(false);
  const [scannedEquipmentId, setScannedEquipmentId] = useState<string | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  
  // Navigation props
  const [targetEquipmentId, setTargetEquipmentId] = useState<string | null>(null);
  const [dashboardFilter, setDashboardFilter] = useState<'All' | 'At Risk'>('All');

  // Load Data from Supabase & Setup Realtime Subscriptions
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // 1. Fetch Settings
        const { data: settingsData } = await supabase.from('settings').select('*').single();
        if (settingsData) {
          setSettings({
            poorLimit: Number(settingsData.poorLimit),
            criticalLimit: Number(settingsData.criticalLimit)
          });
        }

        // 2. Fetch Users
        const { data: userData } = await supabase.from('user_accounts').select('*');
        if (userData && userData.length > 0) {
           setUsers(userData);
        } else {
           setUsers([DEFAULT_ADMIN]);
        }

        // 3. Fetch Equipment
        const { data: eqData } = await supabase.from('equipment').select('*');
        if (eqData) setEquipments(eqData);

        // 4. Fetch Readings
        const { data: readingData } = await supabase.from('readings').select('*');
        if (readingData) setReadings(readingData);

        setIsConnected(true);
      } catch (error) {
        console.error("Failed to fetch initial data", error);
        setIsConnected(false);
        setUsers([DEFAULT_ADMIN]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Realtime Subscriptions
    const channel = supabase.channel('db_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'equipment' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setEquipments((prev) => {
              if (prev.some(e => e.id === payload.new.id)) return prev;
              return [...prev, payload.new as Equipment];
            });
          } else if (payload.eventType === 'UPDATE') {
            setEquipments((prev) => prev.map((item) => (item.id === payload.new.id ? { ...item, ...payload.new } as Equipment : item)));
          } else if (payload.eventType === 'DELETE') {
            setEquipments((prev) => prev.filter((item) => item.id !== payload.old.id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'readings' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setReadings((prev) => {
              if (prev.some(r => r.id === payload.new.id)) return prev;
              return [payload.new as Reading, ...prev]; // Add new reading to top
            });
          } else if (payload.eventType === 'UPDATE') {
            setReadings((prev) => prev.map((item) => (item.id === payload.new.id ? { ...item, ...payload.new } as Reading : item)));
          } else if (payload.eventType === 'DELETE') {
            setReadings((prev) => prev.filter((item) => item.id !== payload.old.id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings' },
        (payload) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
             setSettings({
               poorLimit: Number(payload.new.poorLimit),
               criticalLimit: Number(payload.new.criticalLimit)
             });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_accounts' },
        (payload) => {
           if (payload.eventType === 'INSERT') {
             setUsers(prev => [...prev, payload.new as UserAccount]);
           } else if (payload.eventType === 'UPDATE') {
             setUsers(prev => prev.map(u => u.id === payload.new.id ? payload.new as UserAccount : u));
           } else if (payload.eventType === 'DELETE') {
             setUsers(prev => prev.filter(u => u.id !== payload.old.id));
           }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Global Scanner Effect
  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;
    
    if (showGlobalScanner) {
      setScannerError(null);
      // Small delay to ensure modal DOM is ready
      const timer = setTimeout(() => {
        const elementId = "global-reader";
        if (!document.getElementById(elementId)) return;

        html5QrCode = new Html5Qrcode(elementId);
        
        html5QrCode.start(
          { facingMode: "environment" }, // Prefer rear camera
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
          },
          (decodedText) => {
            // Success
            const eq = equipments.find(e => e.id === decodedText);
            if (eq) {
              setScannedEquipmentId(eq.id);
              setShowGlobalScanner(false);
              setShowActionModal(true);
              html5QrCode?.stop().catch(console.error);
            } else {
              // Could add a toast here for invalid code
              console.warn("Unknown code:", decodedText);
            }
          },
          (errorMessage) => {
            // Ignore frame parse errors
          }
        ).catch(err => {
          console.error("Error starting scanner:", err);
          setScannerError("Camera access failed. Please ensure permissions are granted and you are using HTTPS.");
        });
      }, 300);

      return () => {
        clearTimeout(timer);
        if (html5QrCode && html5QrCode.isScanning) {
          html5QrCode.stop().then(() => html5QrCode?.clear()).catch(console.error);
        }
      };
    }
  }, [showGlobalScanner, equipments]);


  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const user = users.find(u => u.username === loginForm.username && u.password === loginForm.password);
    if (user) {
      setCurrentUser(user);
      localStorage.setItem('arrester_user', JSON.stringify(user)); // Save user to localStorage
      setLoginError('');
      setLoginForm({ username: '', password: '' });
    } else {
      setLoginError('Invalid username or password');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('arrester_user'); // Clear user from localStorage
    setCurrentView('dashboard');
  };

  const handleNavigateFromQR = (view: 'equipment' | 'dashboard') => {
    setTargetEquipmentId(scannedEquipmentId);
    setCurrentView(view);
    setShowActionModal(false);
    setScannedEquipmentId(null);
  };

  const getLatestReadingApp = (eqId: string) => {
    return readings
      .filter(r => r.equipmentId === eqId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  };

  const getStatusApp = (eq: Equipment, latest?: Reading): HealthStatus => {
    if (eq.statusOverride) return eq.statusOverride as HealthStatus;
    if (!latest) return 'Satisfactory';
    const val = Number(latest.correctedResistiveCurrent);
    if (val === 0) return 'Probe Failure';
    if (val > settings.criticalLimit) return 'Critical';
    if (val > settings.poorLimit) return 'Poor';
    return 'Satisfactory';
  };

  const globalHealthStats: GlobalHealthStats = useMemo(() => {
    let satisfactory = 0;
    let poor = 0;
    let critical = 0;
    let probeFailure = 0;

    equipments.forEach(eq => {
      const latest = getLatestReadingApp(eq.id);
      const status = getStatusApp(eq, latest);
      switch (status) {
        case 'Satisfactory': satisfactory++; break;
        case 'Poor': poor++; break;
        case 'Critical': critical++; break;
        case 'Probe Failure': probeFailure++; break;
        default: break;
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


  if (loading) {
      return (
          <div className="min-h-screen bg-slate-900 flex items-center justify-center">
              <div className="text-center text-white">
                  <Loader2 size={48} className="animate-spin mx-auto mb-4 text-blue-500" />
                  <h2 className="text-xl font-bold">Initializing ArresterGuard...</h2>
                  <p className="text-slate-400 text-sm mt-2">Connecting to Secure Database</p>
              </div>
          </div>
      );
  }

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
            <div className="mt-4 flex justify-center">
                 {isConnected ? 
                    <span className="text-[10px] text-emerald-500 flex items-center gap-1"><Cloud size={12}/> Cloud Database Connected</span> : 
                    <span className="text-[10px] text-amber-500 flex items-center gap-1"><CloudOff size={12}/> Offline Mode / Connection Failed</span>
                 }
            </div>
          </form>
        </div>
      </div>
    );
  }

  const isAdmin = currentUser.role === 'Admin';
  const isTechnician = currentUser.role === 'Technician';
  const hasWriteAccess = isAdmin || isTechnician;

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
          {/* Global Scanner Button */}
          <button
             onClick={() => { setIsSidebarOpen(false); setShowGlobalScanner(true); }}
             className="flex items-center w-full px-4 py-3 mb-2 rounded-lg text-sm font-bold bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg hover:from-blue-500 hover:to-blue-600 transition-all"
          >
             <QrCode size={20} className="mr-3" />
             Scan Asset QR
          </button>

          {filteredMenuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setCurrentView(item.id as View);
                setIsSidebarOpen(false);
                setTargetEquipmentId(null); // Clear any previous deep links
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
          <div className="mt-2 text-sm text-slate-500 text-center font-semibold">
            © 2026 N.V Allonar™
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="shrink-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button className="md:hidden p-2 text-slate-600" onClick={toggleSidebar}>
              <Menu size={24} />
            </button>
            
            <div className="flex flex-col">
              <div 
                onClick={() => { setCurrentView('dashboard'); setDashboardFilter('All'); }}
                className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400 mb-1 cursor-pointer hover:text-blue-600 transition-colors"
              >
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
          
          <div className="flex items-center gap-4 ml-auto">
            <div className="flex bg-slate-100 p-2 rounded-xl items-center gap-2 text-xs font-medium text-slate-700">
              <Database size={14} className="text-slate-500"/>
              <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wide">Assets:</span>
              <span className="font-bold text-slate-900">{globalHealthStats.totalAssets}</span>
            </div>
            <div 
              onClick={() => { setCurrentView('dashboard'); setDashboardFilter('At Risk'); }}
              className={`bg-white border p-2 rounded-xl flex items-center gap-2 text-xs font-medium cursor-pointer transition-all active:scale-95
                          ${globalHealthStats.atRisk > 0 ? 'border-rose-300 text-rose-700 shadow-sm hover:bg-rose-50' : 'border-emerald-200 text-emerald-700 shadow-sm hover:bg-emerald-50'}`}
            >
              {globalHealthStats.atRisk > 0 ? (
                <>
                  <AlertCircle size={16} className="text-rose-500" />
                  <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wide">Action Required</span>
                  <span className="font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded text-[10px]">{globalHealthStats.atRisk}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wide">All Good!</span>
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
                searchTerm={''} 
                isAdmin={hasWriteAccess}
                initialTargetId={targetEquipmentId}
                initialStatusFilter={dashboardFilter}
              />
            )}
            {currentView === 'equipment' && (
              <EquipmentManager 
                equipments={equipments} 
                setEquipments={setEquipments} 
                readings={readings}
                setReadings={setReadings}
                isAdmin={hasWriteAccess} 
                initialEditId={targetEquipmentId}
                currentUser={currentUser}
                settings={settings}
              />
            )}
            {currentView === 'readings' && (
              <DataEntry 
                equipments={equipments} 
                setEquipments={setEquipments}
                addReading={(r) => setReadings(prev => [r, ...prev])} 
                setReadings={setReadings}
                isAdmin={hasWriteAccess}
                currentUser={currentUser}
              />
            )}
            {currentView === 'history' && (
              <HistoryView 
                readings={readings} 
                setReadings={setReadings} 
                equipments={equipments}
                setEquipments={setEquipments} 
                isAdmin={hasWriteAccess}
                settings={settings}
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
                equipments={equipments}
                setEquipments={setEquipments}
                readings={readings}
                setReadings={setReadings}
                users={users}
                setUsers={setUsers}
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

      {/* Global QR Scanner Modal */}
      {showGlobalScanner && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative">
             <div className="p-4 bg-slate-800 text-white flex justify-between items-center relative z-20">
                <h3 className="font-bold flex items-center gap-2"><QrCode size={18} /> Scan Asset Tag</h3>
                <button onClick={() => setShowGlobalScanner(false)} className="p-1 hover:bg-slate-700 rounded"><X size={20} /></button>
             </div>
             <div className="p-4 bg-black relative">
                <div id="global-reader" className="w-full h-72 bg-slate-900 rounded overflow-hidden"></div>
                
                {scannerError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 z-10 p-6 text-center">
                    <div>
                      <ShieldAlert className="mx-auto text-rose-500 mb-2" size={32} />
                      <p className="text-white text-sm font-bold mb-1">Camera Access Error</p>
                      <p className="text-slate-400 text-xs">{scannerError}</p>
                    </div>
                  </div>
                )}
                
                {!scannerError && (
                  <p className="text-center text-xs text-slate-400 mt-2 absolute bottom-2 left-0 right-0 z-10 pointer-events-none">Align QR code within the frame</p>
                )}
             </div>
          </div>
        </div>
      )}

      {/* Action Selection Modal */}
      {showActionModal && scannedEquipmentId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95">
             <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
               <div>
                 <h3 className="text-lg font-bold text-slate-800">Asset Detected</h3>
                 <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                   {equipments.find(e => e.id === scannedEquipmentId)?.name || 'Unknown Asset'}
                 </p>
               </div>
               <button onClick={() => { setShowActionModal(false); setScannedEquipmentId(null); }} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
             </div>
             <div className="p-8 grid grid-cols-1 gap-4">
                <button 
                  onClick={() => handleNavigateFromQR('equipment')}
                  className="group flex items-center justify-between p-4 rounded-2xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
                >
                   <div className="flex items-center gap-4">
                      <div className="p-3 bg-blue-100 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <Edit size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 group-hover:text-blue-700">Edit Equipment Metadata</h4>
                        <p className="text-xs text-slate-500">Modify properties, location, or ratings</p>
                      </div>
                   </div>
                   <ArrowRight size={20} className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                </button>

                <button 
                  onClick={() => handleNavigateFromQR('dashboard')}
                  className="group flex items-center justify-between p-4 rounded-2xl border-2 border-slate-100 hover:border-emerald-500 hover:bg-emerald-50 transition-all text-left"
                >
                   <div className="flex items-center gap-4">
                      <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                        <BarChart3 size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 group-hover:text-emerald-700">Operational Health Overview</h4>
                        <p className="text-xs text-slate-500">View live status, trends, and history</p>
                      </div>
                   </div>
                   <ArrowRight size={20} className="text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;