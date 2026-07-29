import React, { useState, useEffect } from 'react';
import { 
  Key, Lock, Unlock, Eye, EyeOff, Plus, Edit3, Trash2, 
  Search, ShieldCheck, RefreshCw, CheckCircle2, AlertCircle, X, Save,
  Download, FileText
} from 'lucide-react';

interface EnvVarItem {
  key: string;
  value: string;
  inDotEnv: boolean;
}

interface EnvManagerProps {
  apiBaseUrl: string;
}

export const EnvManager: React.FC<EnvManagerProps> = ({ apiBaseUrl }) => {
  const [password, setPassword] = useState('');
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [envVars, setEnvVars] = useState<EnvVarItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleValues, setVisibleValues] = useState<Record<string, boolean>>({});

  // Feedback notifications
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Edit / Add Modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState('');
  const [modalValue, setModalValue] = useState('');
  const [isNewVar, setIsNewVar] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  // Delete modal state
  const [deleteTargetKey, setDeleteTargetKey] = useState<string | null>(null);

  // Change Password state
  const [changePassOpen, setChangePassOpen] = useState(false);
  const [currentPassInput, setCurrentPassInput] = useState('');
  const [newPassInput, setNewPassInput] = useState('');
  const [confirmPassInput, setConfirmPassInput] = useState('');
  const [changePassError, setChangePassError] = useState<string | null>(null);
  const [changePassSuccess, setChangePassSuccess] = useState<string | null>(null);
  const [changePassLoading, setChangePassLoading] = useState(false);

  // Check if session password stored in sessionStorage
  useEffect(() => {
    const savedPass = sessionStorage.getItem('env_access_pass');
    if (savedPass) {
      setPassword(savedPass);
      verifyAndFetch(savedPass);
    }
  }, []);

  const showNotification = (msg: string, isError = false) => {
    if (isError) {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 5000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  const verifyAndFetch = async (passToTry: string) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/admin/env/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passToTry })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setIsUnlocked(true);
        setEnvVars(data.envVars || []);
        sessionStorage.setItem('env_access_pass', passToTry);
      } else {
        setIsUnlocked(false);
        setAuthError(data.error || 'Incorrect access password.');
        sessionStorage.removeItem('env_access_pass');
      }
    } catch (err: any) {
      setAuthError('Connection failed. Please verify backend server status.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setAuthError('Please enter the access password.');
      return;
    }
    verifyAndFetch(password);
  };

  const handleLockSession = () => {
    setIsUnlocked(false);
    setPassword('');
    sessionStorage.removeItem('env_access_pass');
  };

  const fetchEnvVars = async () => {
    if (!password) return;
    setLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/admin/env/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setEnvVars(data.envVars || []);
      } else {
        showNotification(data.error || 'Failed to refresh environment variables', true);
      }
    } catch (err: any) {
      showNotification('Error refreshing environment variables', true);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveVariable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalKey.trim()) return;

    setModalLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/admin/env/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          key: modalKey.trim(),
          value: modalValue
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showNotification(`Variable '${modalKey.trim()}' updated successfully.`);
        setEditModalOpen(false);
        fetchEnvVars();
      } else {
        showNotification(data.error || 'Failed to save environment variable.', true);
      }
    } catch (err: any) {
      showNotification('Network error while saving variable.', true);
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteVariable = async () => {
    if (!deleteTargetKey) return;

    try {
      const response = await fetch(`${apiBaseUrl}/api/admin/env/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          key: deleteTargetKey
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showNotification(`Variable '${deleteTargetKey}' deleted successfully.`);
        setDeleteTargetKey(null);
        fetchEnvVars();
      } else {
        showNotification(data.error || 'Failed to delete variable.', true);
      }
    } catch (err: any) {
      showNotification('Network error while deleting variable.', true);
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePassError(null);
    setChangePassSuccess(null);

    if (newPassInput !== confirmPassInput) {
      setChangePassError('New passwords do not match.');
      return;
    }

    if (newPassInput.trim().length < 3) {
      setChangePassError('New password must be at least 3 characters.');
      return;
    }

    setChangePassLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/admin/env/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: currentPassInput,
          newPassword: newPassInput.trim()
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setChangePassSuccess('Password updated successfully! Please re-authenticate if required.');
        setPassword(newPassInput.trim());
        sessionStorage.setItem('env_access_pass', newPassInput.trim());
        setTimeout(() => {
          setChangePassOpen(false);
          setCurrentPassInput('');
          setNewPassInput('');
          setConfirmPassInput('');
          setChangePassSuccess(null);
        }, 1500);
      } else {
        setChangePassError(data.error || 'Failed to change password.');
      }
    } catch (err: any) {
      setChangePassError('Network error while changing password.');
    } finally {
      setChangePassLoading(false);
    }
  };

  const toggleValueVisibility = (key: string) => {
    setVisibleValues(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDownload = (format: 'env' | 'txt') => {
    if (envVars.length === 0) {
      showNotification('No environment variables available to download.', true);
      return;
    }

    const content = envVars
      .map(item => {
        const val = item.value || '';
        if (val.includes('\n') || val.includes('"') || val.includes(' ') || val.includes('#')) {
          return `${item.key}="${val.replace(/"/g, '\\"')}"`;
        }
        return `${item.key}=${val}`;
      })
      .join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = format === 'env' ? '.env' : 'environment_variables.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showNotification(`Downloaded variables as ${format === 'env' ? '.env' : 'environment_variables.txt'}`);
  };

  const openAddModal = () => {
    setIsNewVar(true);
    setModalKey('');
    setModalValue('');
    setEditModalOpen(true);
  };

  const openEditModal = (item: EnvVarItem) => {
    setIsNewVar(false);
    setModalKey(item.key);
    setModalValue(item.value);
    setEditModalOpen(true);
  };

  const filteredEnvVars = envVars.filter(item => 
    item.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.value.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Locked Access Screen
  if (!isUnlocked) {
    return (
      <div className="flex-1 p-6 md:p-10 bg-dashboard-bg flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="w-full max-w-md bg-panel-bg border border-sleek-border rounded-2xl p-8 shadow-2xl space-y-6">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-inner">
              <Lock size={28} />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Protected Environment Variables</h2>
            <p className="text-sm text-sleek-dim leading-relaxed">
              Enter the access password to view, edit, or add environment variables securely.
            </p>
          </div>

          <form onSubmit={handleUnlockSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-sleek-dim uppercase tracking-wider">Access Password</label>
              <div className="relative">
                <input
                  type={showPasswordInput ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password (Default: Company1.)"
                  className="w-full bg-dashboard-bg border border-sleek-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all pr-12"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPasswordInput(!showPasswordInput)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sleek-dim hover:text-white p-1 transition-colors"
                >
                  {showPasswordInput ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {authError && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
                <AlertCircle size={16} className="shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-linear-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-medium py-3 px-4 rounded-xl shadow-lg shadow-indigo-500/25 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {authLoading ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <Unlock size={18} />
                  <span>Unlock Manager</span>
                </>
              )}
            </button>
          </form>

          <div className="border-t border-sleek-border/60 pt-4 text-center">
            <p className="text-xs text-sleek-dim">
              Initial hardcoded password: <code className="bg-dashboard-bg px-2 py-0.5 rounded text-indigo-300 font-mono">Company1.</code>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 md:p-10 bg-dashboard-bg overflow-y-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-sleek-border">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Key size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Environment Variables</h1>
              <p className="text-xs text-sleek-dim">View, configure, and safely modify runtime & .env properties</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setChangePassOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-panel-bg hover:bg-sleek-border/40 border border-sleek-border text-sleek-text hover:text-white rounded-xl text-xs font-medium transition-all cursor-pointer"
          >
            <ShieldCheck size={16} className="text-indigo-400" />
            <span>Change Access Password</span>
          </button>

          <button
            onClick={handleLockSession}
            className="flex items-center gap-2 px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-xl text-xs font-medium transition-all cursor-pointer"
          >
            <Lock size={16} />
            <span>Lock Session</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="flex items-center gap-2 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm">
          <CheckCircle2 size={18} className="shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          <AlertCircle size={18} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sleek-dim" />
          <input
            type="text"
            placeholder="Search by key or value..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-panel-bg border border-sleek-border rounded-xl pl-10 pr-4 py-2.5 text-white text-xs focus:outline-none focus:border-indigo-500 transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => handleDownload('env')}
            title="Download variables as .env file"
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2.5 bg-panel-bg hover:bg-sleek-border/40 border border-sleek-border text-emerald-400 hover:text-emerald-300 rounded-xl text-xs font-medium transition-all cursor-pointer"
          >
            <Download size={16} />
            <span>Download .env</span>
          </button>

          <button
            onClick={() => handleDownload('txt')}
            title="Download variables as .txt file"
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2.5 bg-panel-bg hover:bg-sleek-border/40 border border-sleek-border text-indigo-400 hover:text-indigo-300 rounded-xl text-xs font-medium transition-all cursor-pointer"
          >
            <FileText size={16} />
            <span>Download .txt</span>
          </button>

          <button
            onClick={fetchEnvVars}
            disabled={loading}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2.5 bg-panel-bg hover:bg-sleek-border/40 border border-sleek-border text-sleek-text hover:text-white rounded-xl text-xs font-medium transition-all cursor-pointer"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            onClick={openAddModal}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <Plus size={16} />
            <span>Add Variable</span>
          </button>
        </div>
      </div>

      {/* Env Vars Table / List */}
      <div className="bg-panel-bg border border-sleek-border rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-sleek-border bg-dashboard-bg/50 text-[11px] font-semibold uppercase tracking-wider text-sleek-dim">
                <th className="py-3.5 px-6">Variable Key</th>
                <th className="py-3.5 px-6">Value</th>
                <th className="py-3.5 px-6">Persistence</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sleek-border/50 text-xs">
              {filteredEnvVars.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-sleek-dim">
                    {searchTerm ? 'No environment variables matching your filter.' : 'No environment variables found.'}
                  </td>
                </tr>
              ) : (
                filteredEnvVars.map((item) => {
                  const isVisible = !!visibleValues[item.key];
                  return (
                    <tr key={item.key} className="hover:bg-dashboard-bg/30 transition-colors group">
                      <td className="py-3.5 px-6 font-mono font-semibold text-indigo-300 select-all">
                        {item.key}
                      </td>
                      <td className="py-3.5 px-6 font-mono">
                        <div className="flex items-center gap-2 max-w-md">
                          <span className="truncate text-white">
                            {isVisible ? (item.value || <em className="text-sleek-dim text-[11px]">empty</em>) : '••••••••••••••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleValueVisibility(item.key)}
                            className="p-1 text-sleek-dim hover:text-white transition-colors shrink-0"
                            title={isVisible ? 'Hide value' : 'Show value'}
                          >
                            {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-6">
                        {item.inDotEnv ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Saved in .env
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            Runtime Process
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(item)}
                            className="p-1.5 text-sleek-dim hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all"
                            title="Edit Variable"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteTargetKey(item.key)}
                            className="p-1.5 text-sleek-dim hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                            title="Delete Variable"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Add Variable Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-panel-bg border border-sleek-border rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-sleek-border">
              <h3 className="text-lg font-bold text-white">
                {isNewVar ? 'Add Environment Variable' : 'Edit Environment Variable'}
              </h3>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-sleek-dim hover:text-white p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveVariable} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-sleek-dim uppercase tracking-wider">Key Name</label>
                <input
                  type="text"
                  value={modalKey}
                  onChange={(e) => setModalKey(e.target.value)}
                  disabled={!isNewVar}
                  placeholder="e.g. PAYHERO_SERVICE_ID"
                  className="w-full bg-dashboard-bg border border-sleek-border rounded-xl px-4 py-2.5 text-white font-mono text-xs focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-sleek-dim uppercase tracking-wider">Value</label>
                <textarea
                  value={modalValue}
                  onChange={(e) => setModalValue(e.target.value)}
                  placeholder="Enter secret value..."
                  rows={4}
                  className="w-full bg-dashboard-bg border border-sleek-border rounded-xl px-4 py-2.5 text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-sleek-border">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 bg-dashboard-bg border border-sleek-border text-sleek-dim hover:text-white rounded-xl text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium shadow-lg shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
                >
                  {modalLoading ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                  <span>Save Variable</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTargetKey && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-panel-bg border border-sleek-border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">Delete Variable?</h3>
            <p className="text-xs text-sleek-dim leading-relaxed">
              Are you sure you want to delete <code className="text-indigo-300 font-mono">{deleteTargetKey}</code>? This will remove it from <code className="text-indigo-300">process.env</code> and the <code className="text-indigo-300">.env</code> file.
            </p>
            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                onClick={() => setDeleteTargetKey(null)}
                className="px-4 py-2 bg-dashboard-bg border border-sleek-border text-sleek-dim hover:text-white rounded-xl text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteVariable}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-medium cursor-pointer shadow-lg shadow-red-600/20"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {changePassOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-panel-bg border border-sleek-border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-sleek-border">
              <h3 className="text-lg font-bold text-white">Change Access Password</h3>
              <button
                onClick={() => setChangePassOpen(false)}
                className="text-sleek-dim hover:text-white p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {changePassError && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
                <AlertCircle size={16} className="shrink-0" />
                <span>{changePassError}</span>
              </div>
            )}

            {changePassSuccess && (
              <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs">
                <CheckCircle2 size={16} className="shrink-0" />
                <span>{changePassSuccess}</span>
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-sleek-dim uppercase tracking-wider">Current Password</label>
                <input
                  type="password"
                  value={currentPassInput}
                  onChange={(e) => setCurrentPassInput(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full bg-dashboard-bg border border-sleek-border rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-sleek-dim uppercase tracking-wider">New Password</label>
                <input
                  type="password"
                  value={newPassInput}
                  onChange={(e) => setNewPassInput(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full bg-dashboard-bg border border-sleek-border rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-sleek-dim uppercase tracking-wider">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassInput}
                  onChange={(e) => setConfirmPassInput(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full bg-dashboard-bg border border-sleek-border rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-sleek-border">
                <button
                  type="button"
                  onClick={() => setChangePassOpen(false)}
                  className="px-4 py-2 bg-dashboard-bg border border-sleek-border text-sleek-dim hover:text-white rounded-xl text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changePassLoading}
                  className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium shadow-lg shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
                >
                  {changePassLoading ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  <span>Update Password</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
