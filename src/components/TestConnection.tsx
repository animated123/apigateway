import React, { useState, useEffect } from 'react';
import { 
  Database, Mail, Lock, Unlock, CheckCircle2, AlertCircle, RefreshCw, 
  Send, ShieldCheck, Eye, EyeOff, Terminal, ArrowLeft, Play, Server, Zap, Check
} from 'lucide-react';

interface TestConnectionProps {
  apiBaseUrl: string;
  onGoHome?: () => void;
}

export const TestConnection: React.FC<TestConnectionProps> = ({ apiBaseUrl, onGoHome }) => {
  // Password protection state
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // DB Test State
  const [dbLoading, setDbLoading] = useState(false);
  const [dbResult, setDbResult] = useState<any>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [dbLatency, setDbLatency] = useState<number | null>(null);

  // Custom SQL Test
  const [customSql, setCustomSql] = useState('SELECT NOW() as current_time, version();');
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<any>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  // Email OTP Test State
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailType, setEmailType] = useState('otp');
  const [customOtpCode, setCustomOtpCode] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailResult, setEmailResult] = useState<any>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Verify OTP State
  const [otpVerifyCode, setOtpVerifyCode] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Check session storage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem('test_conn_unlocked');
    if (saved === 'Company1') {
      setIsUnlocked(true);
      runDbConnectionTest();
    }
  }, []);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === 'Company1') {
      setIsUnlocked(true);
      setAuthError(null);
      sessionStorage.setItem('test_conn_unlocked', 'Company1');
      runDbConnectionTest();
    } else {
      setAuthError('Incorrect password. Access denied.');
    }
  };

  const handleLock = () => {
    setIsUnlocked(false);
    setPasswordInput('');
    sessionStorage.removeItem('test_conn_unlocked');
  };

  const runDbConnectionTest = async () => {
    setDbLoading(true);
    setDbError(null);
    setDbResult(null);
    const startTime = Date.now();

    try {
      const response = await fetch(`${apiBaseUrl}/api/db/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test' })
      });

      const endTime = Date.now();
      setDbLatency(endTime - startTime);

      const data = await response.json();

      if (response.ok && data.success) {
        setDbResult(data);
      } else {
        setDbError(data.error || data.message || 'Database connection test failed.');
      }
    } catch (err: any) {
      setDbError(err.message || 'Network error attempting to reach database endpoint.');
    } finally {
      setDbLoading(false);
    }
  };

  const runCustomQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSql.trim()) return;

    setQueryLoading(true);
    setQueryError(null);
    setQueryResult(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/db/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'query', sql: customSql })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setQueryResult(data.data || data.rows || data);
      } else {
        setQueryError(data.error || 'Query execution failed.');
      }
    } catch (err: any) {
      setQueryError(err.message || 'Failed to execute query.');
    } finally {
      setQueryLoading(false);
    }
  };

  const handleSendEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail.trim()) {
      setEmailError('Please enter a recipient email address.');
      return;
    }

    setEmailLoading(true);
    setEmailError(null);
    setEmailResult(null);

    try {
      const payload = {
        to: recipientEmail.trim(),
        type: emailType,
        reference: customOtpCode.trim() || undefined
      };

      const response = await fetch(`${apiBaseUrl}/api/notifications/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        setEmailResult(data);
        if (data.code) {
          setOtpVerifyCode(String(data.code));
        }
      } else {
        setEmailError(data.error || data.message || 'Failed to send test email/OTP.');
      }
    } catch (err: any) {
      setEmailError(err.message || 'Network error sending test email.');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail.trim() || !otpVerifyCode.trim()) {
      setVerifyError('Email and verification code are both required.');
      return;
    }

    setVerifyLoading(true);
    setVerifyError(null);
    setVerifyResult(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/notifications/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: recipientEmail.trim(),
          code: otpVerifyCode.trim()
        })
      });

      const data = await response.json();

      if (response.ok) {
        setVerifyResult(data);
      } else {
        setVerifyError(data.error || 'OTP verification failed.');
      }
    } catch (err: any) {
      setVerifyError(err.message || 'Network error verifying OTP.');
    } finally {
      setVerifyLoading(false);
    }
  };

  // Locked Screen
  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-dashboard-bg flex items-center justify-center p-6 text-white font-sans">
        <div className="w-full max-w-md bg-panel-bg border border-sleek-border rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-inner">
              <Lock size={32} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Protected Diagnostics</h1>
            <p className="text-xs text-sleek-dim leading-relaxed">
              Path <code className="text-indigo-300 font-mono">/testconnection</code> is protected. Enter the access password to test database connectivity and email OTP submission.
            </p>
          </div>

          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-sleek-dim uppercase tracking-wider">Access Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter password..."
                  className="w-full bg-dashboard-bg border border-sleek-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500 transition-all pr-12"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sleek-dim hover:text-white p-1 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
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
              className="w-full bg-linear-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-medium py-3 px-4 rounded-xl shadow-lg shadow-indigo-500/25 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Unlock size={18} />
              <span>Unlock /testconnection</span>
            </button>
          </form>

          {onGoHome && (
            <div className="border-t border-sleek-border/60 pt-4 text-center">
              <button
                type="button"
                onClick={onGoHome}
                className="text-xs text-sleek-dim hover:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Return to Main Portal</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Unlocked Test Page
  return (
    <div className="min-h-screen bg-dashboard-bg text-sleek-text font-sans p-4 md:p-8 overflow-y-auto space-y-8">
      {/* Top Navigation Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-sleek-border">
        <div className="flex items-center gap-3">
          {onGoHome && (
            <button
              onClick={onGoHome}
              className="p-2 bg-panel-bg hover:bg-sleek-border/40 border border-sleek-border text-sleek-dim hover:text-white rounded-xl transition-all cursor-pointer"
              title="Return to Main Portal"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white tracking-tight">/testconnection Diagnostics</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Unlocked
              </span>
            </div>
            <p className="text-xs text-sleek-dim">Public test suite for PostgreSQL database connection and Email OTP delivery</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={runDbConnectionTest}
            disabled={dbLoading}
            className="flex items-center gap-2 px-3.5 py-2 bg-panel-bg hover:bg-sleek-border/40 border border-sleek-border text-indigo-400 hover:text-indigo-300 rounded-xl text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={16} className={dbLoading ? 'animate-spin' : ''} />
            <span>Re-Test DB</span>
          </button>

          <button
            onClick={handleLock}
            className="flex items-center gap-2 px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-xl text-xs font-medium transition-all cursor-pointer"
          >
            <Lock size={16} />
            <span>Lock Session</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* PANEL 1: Database Connection Test */}
        <div className="bg-panel-bg border border-sleek-border rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-sleek-border/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <Database size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">PostgreSQL DB Test</h2>
                <p className="text-xs text-sleek-dim">Verifies host, credentials, and schema queries</p>
              </div>
            </div>

            <button
              onClick={runDbConnectionTest}
              disabled={dbLoading}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              {dbLoading ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
              <span>Test Connection</span>
            </button>
          </div>

          {/* Status Display */}
          {dbLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-sleek-dim space-y-3">
              <RefreshCw size={28} className="animate-spin text-indigo-400" />
              <p className="text-xs font-mono">Testing database socket & query execution...</p>
            </div>
          ) : dbError ? (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertCircle size={18} />
                <span>Connection Failure: DISCONNECTED</span>
              </div>
              <p className="font-mono text-[11px] leading-relaxed bg-black/40 p-3 rounded-lg border border-red-500/20 overflow-x-auto">
                {dbError}
              </p>
              <p className="text-[11px] text-red-300">
                Verify database settings in <code className="text-white">postgres-config.json</code> or runtime environment variables.
              </p>
            </div>
          ) : dbResult ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <CheckCircle2 size={18} />
                  <span>STATUS: CONNECTED</span>
                </div>
                {dbLatency !== null && (
                  <span className="text-[11px] font-mono bg-emerald-950/60 px-2.5 py-1 rounded-md text-emerald-300">
                    Latency: {dbLatency}ms
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-dashboard-bg/60 p-3 rounded-xl border border-sleek-border/50 space-y-1">
                  <span className="text-[10px] text-sleek-dim uppercase font-mono">Database Name</span>
                  <p className="font-mono font-bold text-white truncate">{dbResult.diagnostics?.database_name || 'N/A'}</p>
                </div>

                <div className="bg-dashboard-bg/60 p-3 rounded-xl border border-sleek-border/50 space-y-1">
                  <span className="text-[10px] text-sleek-dim uppercase font-mono">Public Tables Count</span>
                  <p className="font-mono font-bold text-indigo-300">{dbResult.diagnostics?.public_tables_count ?? 'N/A'}</p>
                </div>

                <div className="bg-dashboard-bg/60 p-3 rounded-xl border border-sleek-border/50 space-y-1 col-span-2">
                  <span className="text-[10px] text-sleek-dim uppercase font-mono">Server Timestamp</span>
                  <p className="font-mono text-white text-[11px]">{dbResult.diagnostics?.server_time || 'N/A'}</p>
                </div>

                <div className="bg-dashboard-bg/60 p-3 rounded-xl border border-sleek-border/50 space-y-1 col-span-2">
                  <span className="text-[10px] text-sleek-dim uppercase font-mono">PostgreSQL Engine Version</span>
                  <p className="font-mono text-[10px] text-sleek-dim truncate">{dbResult.diagnostics?.db_version || 'N/A'}</p>
                </div>
              </div>

              {/* Public Tables List */}
              {Array.isArray(dbResult.diagnostics?.tables) && (
                <div className="space-y-2 pt-2 border-t border-sleek-border/60">
                  <span className="text-[10px] font-semibold text-sleek-dim uppercase tracking-wider">Discovered Public Tables</span>
                  <div className="flex flex-wrap gap-1.5">
                    {dbResult.diagnostics.tables.map((tbl: string) => (
                      <span key={tbl} className="px-2.5 py-1 bg-dashboard-bg border border-sleek-border rounded-lg text-[11px] font-mono text-indigo-300">
                        {tbl}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-xs text-sleek-dim">
              Click "Test Connection" above to verify database connectivity.
            </div>
          )}

          {/* Interactive Query Sandbox */}
          <div className="pt-4 border-t border-sleek-border space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sleek-dim flex items-center gap-1.5">
              <Terminal size={14} className="text-indigo-400" />
              <span>Run Test Query</span>
            </h3>

            <form onSubmit={runCustomQuery} className="space-y-3">
              <textarea
                value={customSql}
                onChange={(e) => setCustomSql(e.target.value)}
                placeholder="Enter SQL statement..."
                rows={2}
                className="w-full bg-dashboard-bg border border-sleek-border rounded-xl p-3 font-mono text-xs text-white focus:outline-none focus:border-indigo-500"
              />

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={queryLoading}
                  className="px-3.5 py-2 bg-panel-bg hover:bg-sleek-border/40 border border-sleek-border text-white rounded-xl text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {queryLoading ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                  <span>Execute SQL</span>
                </button>
              </div>
            </form>

            {queryError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-mono">
                {queryError}
              </div>
            )}

            {queryResult && (
              <div className="bg-dashboard-bg border border-sleek-border rounded-xl p-3 max-h-48 overflow-y-auto">
                <pre className="text-[10px] font-mono text-emerald-300 whitespace-pre-wrap">
                  {JSON.stringify(queryResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* PANEL 2: Email Submission & OTP Test */}
        <div className="bg-panel-bg border border-sleek-border rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center gap-3 border-b border-sleek-border/80 pb-4">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Mail size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Email Submission & OTP Test</h2>
              <p className="text-xs text-sleek-dim">Sends OTP verification code via Nodemailer SMTP</p>
            </div>
          </div>

          {/* Form to Send Test Email */}
          <form onSubmit={handleSendEmailOtp} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-sleek-dim uppercase tracking-wider">Recipient Email Address</label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="e.g. testuser@example.com"
                className="w-full bg-dashboard-bg border border-sleek-border rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-sleek-dim uppercase tracking-wider">Email Type</label>
                <select
                  value={emailType}
                  onChange={(e) => setEmailType(e.target.value)}
                  className="w-full bg-dashboard-bg border border-sleek-border rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="otp">OTP Code</option>
                  <option value="verification">Verification</option>
                  <option value="welcome">Welcome</option>
                  <option value="payment">Payment</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-sleek-dim uppercase tracking-wider">Custom OTP Code (Optional)</label>
                <input
                  type="text"
                  value={customOtpCode}
                  onChange={(e) => setCustomOtpCode(e.target.value)}
                  placeholder="Auto-generated if empty"
                  className="w-full bg-dashboard-bg border border-sleek-border rounded-xl px-3 py-2.5 text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={emailLoading}
              className="w-full py-3 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {emailLoading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Sending Email & OTP...</span>
                </>
              ) : (
                <>
                  <Send size={16} />
                  <span>Send Test Email / OTP</span>
                </>
              )}
            </button>
          </form>

          {/* Email Result Feedback */}
          {emailError && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <AlertCircle size={16} />
                <span>Failed to Send Email</span>
              </div>
              <p className="font-mono text-[11px]">{emailError}</p>
            </div>
          )}

          {emailResult && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold">
                  <CheckCircle2 size={16} />
                  <span>Email Dispatched Successfully!</span>
                </div>
                {emailResult.code && (
                  <span className="font-mono text-xs bg-emerald-950 px-2.5 py-1 rounded-md text-emerald-300 font-bold border border-emerald-500/30">
                    OTP: {emailResult.code}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-emerald-300/80">
                {emailResult.message || 'Email submitted to Nodemailer SMTP transport server.'}
              </p>
            </div>
          )}

          {/* Sub-Section: Verify OTP Test */}
          <div className="pt-4 border-t border-sleek-border space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sleek-dim flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-purple-400" />
              <span>Verify Sent OTP Code</span>
            </h3>

            <form onSubmit={handleVerifyOtp} className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={otpVerifyCode}
                  onChange={(e) => setOtpVerifyCode(e.target.value)}
                  placeholder="Enter 6-digit OTP code"
                  className="flex-1 bg-dashboard-bg border border-sleek-border rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                />

                <button
                  type="submit"
                  disabled={verifyLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {verifyLoading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  <span>Verify OTP</span>
                </button>
              </div>
            </form>

            {verifyError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-mono">
                {verifyError}
              </div>
            )}

            {verifyResult && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span className="font-bold">{verifyResult.message || 'OTP code verified successfully!'}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
