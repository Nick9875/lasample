import React, { useState } from 'react';
import { UserPlus, Trash2, Shield, User, X, Wrench, Hammer, Key } from 'lucide-react';
import { UserAccount, Role, Equipment, Reading, ThresholdSettings } from '../types';
import { supabase } from '../services/supabaseClient';

interface UserManagementProps {
  users: UserAccount[];
  setUsers: React.Dispatch<React.SetStateAction<UserAccount[]>>;
  currentUser: UserAccount; 
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
  
  // Reset States
  const [showResetDataConfirmModal, setShowResetDataConfirmModal] = useState(false);
  const [showFactoryResetConfirmModal, setShowFactoryResetConfirmModal] = useState(false);
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [resetPasswordError, setResetPasswordError] = useState('');

  // Password Change States
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<UserAccount | null>(null);
  const [newPasswordData, setNewPasswordData] = useState({ new: '', confirm: '' });

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (users.find(u => u.username === formData.username)) {
      alert("Username already exists");
      return;
    }
    const newUser: UserAccount = {
      id: Date.now().toString(),
      ...formData
    };

    const { error } = await supabase.from('user_accounts').insert(newUser);
    
    if (error) {
        alert("Error creating user: " + error.message);
        return;
    }

    setUsers([...users, newUser]);
    setIsAdding(false);
    setFormData({ username: '', password: '', role: 'Guest' });
  };

  const handleDeleteUser = async (id: string) => {
    if (!currentUser || currentUser.role !== 'Admin') {
      alert("Admin access required to delete users.");
      return;
    }
    if (users.find(u => u.id === id)?.username === defaultAdmin.username) {
        alert("The default admin account cannot be deleted.");
        return;
    }
    if (confirm("Are you sure you want to delete this user?")) {
      const { error } = await supabase.from('user_accounts').delete().eq('id', id);
      if (error) {
          alert("Error deleting user: " + error.message);
          return;
      }
      setUsers(users.filter(u => u.id !== id));
    }
  };

  const initiatePasswordChange = (user: UserAccount) => {
    setPasswordTarget(user);
    setNewPasswordData({ new: '', confirm: '' });
    setIsChangingPassword(true);
  };

  const handlePasswordChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordTarget) return;

    if (newPasswordData.new !== newPasswordData.confirm) {
      alert("Passwords do not match.");
      return;
    }

    if (newPasswordData.new.length < 4) {
      alert("Password is too short (min 4 characters).");
      return;
    }

    const { error } = await supabase.from('user_accounts')
        .update({ password: newPasswordData.new })
        .eq('id', passwordTarget.id);

    if (error) {
        alert("Error updating password: " + error.message);
        return;
    }

    const updatedUsers = users.map(u => 
      u.id === passwordTarget.id ? { ...u, password: newPasswordData.new } : u
    );

    setUsers(updatedUsers);

    // If the admin changed their own password, update the current session state so they stay logged in with new creds
    if (currentUser.id === passwordTarget.id) {
      setCurrentUser({ ...currentUser, password: newPasswordData.new });
    }

    alert(`Password for user '${passwordTarget.username}' updated successfully.`);
    setIsChangingPassword(false);
    setPasswordTarget(null);
  };

  const handleResetData = () => {
    if (!currentUser || currentUser.role !== 'Admin') {
      alert("Admin login required for this operation.");
      return;
    }

    if (window.confirm("WARNING: This will delete ALL equipment and measurement records permanently from the database. User accounts and system settings will NOT be affected.\n\nAre you sure you want to proceed?")) {
      setShowResetDataConfirmModal(true);
      setResetPasswordInput('');
      setResetPasswordError('');
    }
  };
  
  const handleFactoryReset = () => {
    if (!currentUser || currentUser.role !== 'Admin') {
      alert("Admin login required for this operation.");
      return;
    }

    if (window.confirm("WARNING: This will perform a FACTORY RESET. All equipment, measurement records, custom users, and settings will be permanently deleted from the database and restored to initial defaults.\n\nAre you absolutely sure you want to proceed?")) {
      setShowFactoryResetConfirmModal(true);
      setResetPasswordInput('');
      setResetPasswordError('');
    }
  };
  
  const confirmDataReset = async () => {
    if (resetPasswordInput.trim() === currentUser.password) {
      try {
        // 1. Delete Readings (Children) first to avoid orphan records if cascading isn't set
        const { error: readingsError } = await supabase.from('readings').delete().neq('id', '0');
        if (readingsError) throw readingsError;

        // 2. Delete Equipment (Parents)
        const { error: equipmentError } = await supabase.from('equipment').delete().neq('id', '0');
        if (equipmentError) throw equipmentError;

        // 3. Update Local State
        setEquipments([]);
        setReadings([]);
        
        alert("All equipment and measurement data has been successfully cleared from the database.");
        setShowResetDataConfirmModal(false);
      } catch (err: any) {
        console.error("Reset Data Error:", err);
        setResetPasswordError("Database Error: " + err.message);
      }
    } else {
      setResetPasswordError("Incorrect password. Please try again.");
    }
  };

  const confirmFactoryReset = async () => {
    if (resetPasswordInput.trim() === currentUser.password) {
      try {
        // 1. Clear Operational Data
        const { error: rErr } = await supabase.from('readings').delete().neq('id', '0');
        if (rErr) throw rErr;

        const { error: eErr } = await supabase.from('equipment').delete().neq('id', '0');
        if (eErr) throw eErr;

        // 2. Reset Users (Keep Admin if ID 0, or recreate)
        // Delete all users except ID 0 (if it exists)
        const { error: uErr } = await supabase.from('user_accounts').delete().neq('id', '0'); 
        if (uErr) throw uErr;

        // Ensure default admin exists/is reset
        const { error: adminErr } = await supabase.from('user_accounts').upsert(defaultAdmin);
        if (adminErr) throw adminErr;

        // 3. Reset Settings
        const { error: sErr } = await supabase.from('settings').upsert({ id: 1, ...initialThreshold });
        if (sErr) throw sErr;

        // 4. Update Local State
        setEquipments([]);
        setReadings([]);
        setSettings(initialThreshold);
        setUsers([defaultAdmin]);
        setCurrentUser(defaultAdmin);
        
        // 5. Reset Local Storage Session to default admin
        localStorage.setItem('arrester_user', JSON.stringify(defaultAdmin));

        alert("Factory reset complete. System restored to default state.");
        setShowFactoryResetConfirmModal(false);
      } catch (err: any) {
        console.error("Factory Reset Error:", err);
        setResetPasswordError("Reset Failed: " + err.message);
      }
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

      {isChangingPassword && passwordTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">Change Password</h3>
              <button onClick={() => setIsChangingPassword(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
            </div>
            <form onSubmit={handlePasswordChangeSubmit} className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4 flex items-center gap-3">
                 <div className="bg-white p-2 rounded-full shadow-sm text-blue-600">
                   <User size={16} />
                 </div>
                 <div>
                   <p className="text-[10px] uppercase font-bold text-blue-400">Target Account</p>
                   <p className="text-sm font-bold text-blue-800">{passwordTarget.username}</p>
                 </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">New Password</label>
                <input 
                  required
                  type="password"
                  placeholder="Enter new password"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  value={newPasswordData.new}
                  onChange={e => setNewPasswordData({...newPasswordData, new: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Confirm Password</label>
                <input 
                  required
                  type="password"
                  placeholder="Re-enter to confirm"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  value={newPasswordData.confirm}
                  onChange={e => setNewPasswordData({...newPasswordData, confirm: e.target.value})}
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                  <Key size={16} /> Update Password
                </button>
                <button type="button" onClick={() => setIsChangingPassword(false)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors">
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
                  <div className="flex items-center justify-end gap-1">
                    <button 
                      onClick={() => initiatePasswordChange(u)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Change Password"
                    >
                      <Key size={16} />
                    </button>
                    <button 
                      disabled={u.username === defaultAdmin.username} // Prevent deleting the initial default admin
                      onClick={() => handleDeleteUser(u.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Delete User"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Danger Zone */}
      {currentUser && currentUser.role === 'Admin' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-6">
          <h3 className="text-lg font-bold text-rose-700 mb-4 text-center">Danger Zone</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h4 className="font-bold text-amber-800">Reset Measurement Data</h4>
              <p className="text-xs text-amber-700 mt-1 mb-3">Permanently delete all equipment and reading records from Supabase. User accounts and system settings will be preserved.</p>
              <button
                onClick={handleResetData}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-amber-500/30 transition-all active:scale-95"
              >
                <Trash2 size={14} /> Reset Data Only
              </button>
            </div>
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
              <h4 className="font-bold text-rose-800">Factory Reset</h4>
              <p className="text-xs text-rose-700 mt-1 mb-3">Delete ALL data including users, equipment, readings, and settings from Supabase. Restores system to its initial state.</p>
              <button
                onClick={handleFactoryReset}
                className="w-full bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-rose-500/30 transition-all active:scale-95"
              >
                <Wrench size={14} /> Full Factory Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modals */}
      {showResetDataConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-amber-800">Confirm Data Reset</h3>
              <button onClick={() => setShowResetDataConfirmModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">To confirm you want to delete all equipment and readings from the database, please enter your administrator password. This action is irreversible.</p>
              {resetPasswordError && <div className="p-3 bg-red-500/20 border border-red-500/30 text-red-400 text-sm rounded-lg text-center font-medium">{resetPasswordError}</div>}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Admin Password</label>
                <input type="password" autoFocus required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-amber-500 outline-none" value={resetPasswordInput} onChange={e => setResetPasswordInput(e.target.value)} onKeyPress={(e) => { if (e.key === 'Enter') confirmDataReset(); }}/>
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={confirmDataReset} className="flex-1 bg-amber-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-amber-500/30 hover:bg-amber-700 transition-all">Confirm Data Reset</button>
                <button type="button" onClick={() => setShowResetDataConfirmModal(false)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showFactoryResetConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-rose-800">Confirm Factory Reset</h3>
              <button onClick={() => setShowFactoryResetConfirmModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">To confirm the factory reset and delete all data from the database, please enter your administrator password. This action is irreversible.</p>
              {resetPasswordError && <div className="p-3 bg-red-500/20 border border-red-500/30 text-red-400 text-sm rounded-lg text-center font-medium">{resetPasswordError}</div>}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Admin Password</label>
                <input type="password" autoFocus required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-rose-500 outline-none" value={resetPasswordInput} onChange={e => setResetPasswordInput(e.target.value)} onKeyPress={(e) => { if (e.key === 'Enter') confirmFactoryReset(); }}/>
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={confirmFactoryReset} className="flex-1 bg-rose-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-rose-500/30 hover:bg-rose-700 transition-all">Confirm Reset</button>
                <button type="button" onClick={() => setShowFactoryResetConfirmModal(false)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;