
import React, { useState } from 'react';
import { UserPlus, Trash2, Shield, User, X, Wrench, Hammer } from 'lucide-react';
import { UserAccount, Role, Equipment, Reading, ThresholdSettings } from '../types';

interface UserManagementProps {
  users: UserAccount[];
  setUsers: React.Dispatch<React.SetStateAction<UserAccount[]>>;
  currentUser: UserAccount; // Required for password verification
  setCurrentUser: React.Dispatch<React.SetStateAction<UserAccount | null>>;
  setEquipments: React.Dispatch<React.SetStateAction<Equipment[]>>;
  setReadings: React.Dispatch<React.SetStateAction<Reading[]>>;
  setSettings: React.Dispatch<React.SetStateAction<ThresholdSettings>>;
  initialThreshold: ThresholdSettings;
  defaultAdmin: UserAccount;
}

const UserManagement: React.FC<UserManagementProps> = ({ 
  users, 
  setUsers, 
  currentUser,
  setCurrentUser,
  setEquipments,
  setReadings,
  setSettings,
  initialThreshold,
  defaultAdmin
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({ username: '', password: '', role: 'Guest' as Role });
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [resetPasswordError, setResetPasswordError] = useState('');

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (users.find(u => u.username === formData.username)) {
      alert("Username already exists");
      return;
    }
    const newUser: UserAccount = {
      id: Date.now().toString(),
      ...formData
    };
    setUsers([...users, newUser]);
    setIsAdding(false);
    setFormData({ username: '', password: '', role: 'Guest' });
  };

  const handleDeleteUser = (id: string) => {
    if (!currentUser || currentUser.role !== 'Admin') {
      alert("Admin access required to delete users.");
      return;
    }
    if (users.find(u => u.id === id)?.username === defaultAdmin.username) {
        alert("The default admin account cannot be deleted.");
        return;
    }
    if (confirm("Are you sure you want to delete this user?")) {
      setUsers(users.filter(u => u.id !== id));
    }
  };

  const handleResetAllData = () => {
    if (!currentUser || currentUser.role !== 'Admin') {
      alert("Admin login required for this operation.");
      return;
    }

    if (window.confirm("WARNING: This will perform a FACTORY RESET. All equipment, measurement records, custom users, and settings will be permanently deleted and restored to initial defaults.\n\nAre you absolutely sure you want to proceed?")) {
      setShowResetConfirmModal(true);
      setResetPasswordInput(''); // Clear previous input
      setResetPasswordError(''); // Clear previous error
    }
  };

  const confirmFactoryReset = () => {
    if (resetPasswordInput.trim() === currentUser.password) {
      setEquipments([]);
      setReadings([]);
      setSettings(initialThreshold);
      setUsers([defaultAdmin]); // Reset users to only the default admin
      setCurrentUser(defaultAdmin); // Log in as the default admin
      alert("Factory reset complete. All data cleared and settings restored to default.");
      setShowResetConfirmModal(false);
    } else {
      setResetPasswordError("Incorrect password. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">User Management</h2>
          <p className="text-slate-500">Manage access control and credentials</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95"
        >
          <UserPlus size={18} /> Create New User
        </button>
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">New User Account</h3>
              <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Username</label>
                <input 
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.username}
                  onChange={e => setFormData({...formData, username: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Password</label>
                <input 
                  required
                  type="password"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Access Role</label>
                <select 
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.role}
                  onChange={e => setFormData({...formData, role: e.target.value as Role})}
                >
                  <option value="Guest">Guest (View Only)</option>
                  <option value="Technician">Technician (Equipment & Data)</option>
                  <option value="Admin">Administrator (Full Access)</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all">
                  Create Account
                </button>
                <button type="button" onClick={() => setIsAdding(false)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200">
            <tr>
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                      <User size={16} />
                    </div>
                    <span className="font-bold text-slate-800">{u.username}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                    u.role === 'Admin' ? 'bg-blue-100 text-blue-700' : 
                    u.role === 'Technician' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {u.role === 'Admin' ? <Shield size={12} /> : u.role === 'Technician' ? <Hammer size={12} /> : null}
                    {u.role}
                  </span>
                </td>
                <td className="px-6 py-4 text-emerald-600 font-medium">Active</td>
                <td className="px-6 py-4 text-right">
                  <button 
                    disabled={u.username === defaultAdmin.username} // Prevent deleting the initial default admin
                    onClick={() => handleDeleteUser(u.id)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Factory Reset Button */}
      {currentUser && currentUser.role === 'Admin' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center mt-6">
          <h3 className="text-lg font-bold text-rose-700 mb-4">Danger Zone</h3>
          <p className="text-sm text-slate-600 mb-6 max-w-lg mx-auto">
            This action will completely wipe all application data, including equipment, measurements,
            and user accounts (except the default admin). All settings will be reverted to factory defaults.
            This action is irreversible.
          </p>
          <button
            onClick={handleResetAllData}
            className="bg-rose-600 hover:bg-rose-700 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-rose-500/30 transition-all active:scale-95 mx-auto"
          >
            <Wrench size={20} /> Perform Factory Reset
          </button>
        </div>
      )}

      {/* Password Confirmation Modal for Factory Reset */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-rose-800">Confirm Factory Reset</h3>
              <button onClick={() => setShowResetConfirmModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                To confirm the factory reset and delete all data, please enter your administrator password.
                This action is irreversible.
              </p>
              {resetPasswordError && (
                <div className="p-3 bg-red-500/20 border border-red-500/30 text-red-400 text-sm rounded-lg text-center font-medium">
                  {resetPasswordError}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Admin Password</label>
                <input 
                  type="password"
                  autoFocus
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-rose-500 outline-none"
                  value={resetPasswordInput}
                  onChange={e => setResetPasswordInput(e.target.value)}
                  onKeyPress={(e) => { if (e.key === 'Enter') confirmFactoryReset(); }}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  onClick={confirmFactoryReset}
                  className="flex-1 bg-rose-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-rose-500/30 hover:bg-rose-700 transition-all"
                >
                  Confirm Reset
                </button>
                <button 
                  type="button" 
                  onClick={() => setShowResetConfirmModal(false)} 
                  className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
