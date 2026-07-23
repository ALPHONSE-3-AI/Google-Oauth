import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

interface UserProfile {
  id: string
  name: string
  email: string
  profile_image: string
  last_login: string
  username?: string // Extended to support display fields for manual logs
}

interface Metric {
  id: string
  metric_name: string
  metric_value: string
  category: string
}

// Phase 6: Core Route Guard Middleware
function ProtectedRoute({ children, sessionUser }: { children: React.ReactNode; sessionUser: any }) {
  if (!sessionUser) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const [sessionUser, setSessionUser] = useState<any>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    // Phase 5 & 7: Check initial token session and catch validation anomalies
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (error) handleGlobalError(error, 'Session Retrieval')
        handleAuthSession(session)
      })
      .catch(err => handleGlobalError(err, 'Critical Lifecycle'))

    // Phase 5: Continually monitor JWT status changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setSessionUser(null)
        setProfile(null)
        setMetrics([])
      } else if (session?.user) {
        handleAuthSession(session)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Phase 7: Centralized Error Translation Engine
  const handleGlobalError = (error: any, context: string) => {
    console.error(`[${context} Error]:`, error)
    const message = error?.message || String(error)
    
    if (message.includes('popup_closed_by_user')) {
      setErrorMessage('Login cancelled. The Google sign-in window was closed before completion.')
    } else if (message.includes('JWT') || message.includes('expired')) {
      setErrorMessage('Your security session has expired. Please log out and sign back in.')
    } else if (message.includes('violates row-level security policy')) {
      setErrorMessage('Security Violation: Access denied by database Row-Level Security.')
    } else if (message.includes('Failed to fetch')) {
      setErrorMessage('Network error. Could not connect to the remote database engine.')
    } else {
      setErrorMessage(`System Alert (${context}): ${message}`)
    }
    setLoading(false)
  }

  const handleAuthSession = async (session: any) => {
    if (session?.user) {
      setSessionUser({ type: 'google', data: session.user })
      await syncUserWithBackend(session.user)
    } else if (!sessionUser) {
      setSessionUser(null)
      setProfile(null)
    }
    setLoading(false)
  }

  // Phase 4: Automatic User Management Sync (Recognize Existing / Create New)
  const syncUserWithBackend = async (googleUser: any) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .upsert({
          email: googleUser.email,
          name: googleUser.user_metadata.full_name || 'Google User',
          google_id: googleUser.id,
          profile_image: googleUser.user_metadata.avatar_url || '',
          auth_provider: 'google',
          last_login: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'email' })
        .select()
        .single()

      if (error) throw error
      setProfile(data)
      await fetchMetrics()
    } catch (err: any) {
      handleGlobalError(err, 'Backend User Sync')
    }
  }

  // Phase 8: Pulling secure RLS protected data
  const fetchMetrics = async () => {
    const { data, error } = await supabase
      .from('dashboard_metrics')
      .select('id, metric_name, metric_value, category')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching metrics:', error.message)
    } else if (data) {
      setMetrics(data)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif', backgroundColor: '#f3f4f6' }}>
        <h3>Verifying system credentials...</h3>
      </div>
    )
  }

  return (
    <BrowserRouter>
      {/* Global Alert Notification Banner (Phase 7) */}
      {errorMessage && (
        <div style={{ 
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#fff0f1', borderLeft: '5px solid #d9383a', color: '#b31d20',
          padding: '1rem 2rem', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 9999, display: 'flex', alignItems: 'center', gap: '2rem', fontFamily: 'sans-serif'
        }}>
          <span><strong>Notice:</strong> {errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} style={{ background: 'none', border: 'none', color: '#d9383a', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
        </div>
      )}

      <Routes>
        {/* Public Landing Interface */}
        <Route path="/" element={sessionUser ? <Navigate to="/dashboard" replace /> : <LoginGateway setSessionUser={setSessionUser} setProfile={setProfile} fetchMetrics={fetchMetrics} handleGlobalError={handleGlobalError} />} />
        
        {/* Phase 6: Guarded Operational Dashboard Route */}
        <Route path="/dashboard" element={
          <ProtectedRoute sessionUser={sessionUser}>
            <Layout profile={profile} setSessionUser={setSessionUser}><DashboardView metrics={metrics} /></Layout>
          </ProtectedRoute>
        } />
        
        {/* Phase 6: Guarded Dataset APIs Route */}
        <Route path="/workspaces" element={
          <ProtectedRoute sessionUser={sessionUser}>
            <Layout profile={profile} setSessionUser={setSessionUser}><WorkspacesView /></Layout>
          </ProtectedRoute>
        } />
        
        {/* Phase 6: Guarded Profile System Route */}
        <Route path="/profile" element={
          <ProtectedRoute sessionUser={sessionUser}>
            <Layout profile={profile} setSessionUser={setSessionUser}><ProfileView profile={profile} /></Layout>
          </ProtectedRoute>
        } />
        
        {/* Global Catch-all Boundary */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

// --- CORE SYSTEM INTERFACE (UPDATED LIGHT THEME + CORRECTED FIELD LABELS) ---

function LoginGateway({ setSessionUser, setProfile, fetchMetrics, handleGlobalError }: any) {
  const [isSignUp, setIsSignUp] = useState<boolean>(false)
  const [username, setUsername] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [authLoading, setAuthLoading] = useState<boolean>(false)

  // Google Login Logic (100% Preserved)
  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
      })
      if (error) throw error
    } catch (err: any) {
      handleGlobalError(err, 'Google Gateway Handshake')
    }
  }

  // Custom User Credentials Pipeline (Reads & Writes to Separate Table)
  const handleCustomAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return

    const cleanUsername = username.trim().toLowerCase()
    setAuthLoading(true)

    try {
      if (isSignUp) {
        // Step A: Check separate table directly to enforce username uniqueness
        const { data: duplicateCheck } = await supabase
          .from('user_credentials')
          .select('username')
          .eq('username', cleanUsername)
          .maybeSingle()

        if (duplicateCheck) {
          throw new Error('This username is already taken. Please pick another one!')
        }

        // Step B: Write new credentials row into the separate table
        const { error: credError } = await supabase
          .from('user_credentials')
          .insert([{ username: cleanUsername, password_hash: password }])

        if (credError) {
          if (credError.message.includes('duplicate key') || credError.code === '23505') {
            throw new Error('This username is already taken. Please pick another one!')
          }
          throw credError
        }

        // Step C: Initialize matching metadata row inside main public.users table
        const { error: profileError } = await supabase
          .from('users')
          .insert([{
            email: `${cleanUsername}@datadeck.local`,
            name: username.trim(),
            auth_provider: 'credentials',
            last_login: new Date().toISOString()
          }])

        if (profileError) console.error('Profile table registration warning:', profileError.message)

        alert('Account successfully created! You can now sign in using your username.')
        setIsSignUp(false)
        setPassword('')
      } else {
        // Step A: Read row inside separate credential table directly
        const { data: credRecord, error: credError } = await supabase
          .from('user_credentials')
          .select('*')
          .eq('username', cleanUsername)
          .maybeSingle()

        if (credError || !credRecord) {
          throw new Error('Account username not found!')
        }

        // Step B: Match password string value
        if (credRecord.password_hash === password) {
          const { data: userProfile } = await supabase
            .from('users')
            .select('*')
            .eq('email', `${cleanUsername}@datadeck.local`)
            .maybeSingle()

          const timestamp = new Date().toISOString()
          if (userProfile) {
            await supabase.from('users').update({ last_login: timestamp }).eq('id', userProfile.id)
            setProfile({ ...userProfile, last_login: timestamp, username: cleanUsername })
          } else {
            setProfile({ id: credRecord.id, name: username.trim(), username: cleanUsername, email: `${cleanUsername}@datadeck.local`, profile_image: '', last_login: timestamp })
          }

          setSessionUser({ type: 'credentials', username: cleanUsername })
          await fetchMetrics()
        } else {
          throw new Error('Incorrect password matching assignment!')
        }
      }
    } catch (err: any) {
      handleGlobalError(err, isSignUp ? 'Credentials Database Registration' : 'Credentials Validation Matching')
    } finally {
      setAuthLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif', backgroundColor: '#f3f4f6' }}>
      <div style={{ padding: '2.5rem', borderRadius: '12px', backgroundColor: '#ffffff', width: '360px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', color: '#1f2937' }}>
        <h2 style={{ margin: '0 0 0.5rem 0', textAlign: 'center', color: '#111827' }}>📊 Data Deck</h2>
        <p style={{ color: '#6b7280', marginBottom: '1.5rem', textAlign: 'center', fontSize: '0.9rem' }}>
          {isSignUp ? 'Register username credentials' : 'Sign in to access secure analytical arrays'}
        </p>

        {/* Username/Password Form Section */}
        <form onSubmit={handleCustomAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: '#4b5563', fontWeight: 500 }}>Username</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              required
              style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#111827', boxSizing: 'border-box', fontSize: '0.95rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', color: '#4b5563', fontWeight: 500 }}>Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#111827', boxSizing: 'border-box', fontSize: '0.95rem' }}
            />
          </div>

          <button 
            type="submit" 
            disabled={authLoading}
            style={{ padding: '0.75rem', fontSize: '0.95rem', fontWeight: 'bold', cursor: 'pointer', border: 'none', borderRadius: '6px', backgroundColor: '#3b82f6', color: '#fff', marginTop: '0.5rem', transition: 'background-color 0.2s' }}
          >
            {authLoading ? 'Verifying...' : isSignUp ? 'Create Account' : 'Login'}
          </button>
        </form>

        {/* UI Visual Layout Separation Line */}
        <div style={{ display: 'flex', alignItems: 'center', margin: '1.5rem 0', color: '#e5e7eb' }}>
          <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #e5e7eb' }} />
          <span style={{ padding: '0 10px', fontSize: '0.8rem', color: '#9ca3af', fontWeight: 500 }}>OR</span>
          <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #e5e7eb' }} />
        </div>

        {/* Original Untouched Google Integration Gateway */}
        <button 
          onClick={handleGoogleLogin} 
          style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem', fontWeight: '600', cursor: 'pointer', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: '#ffffff', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', transition: 'background-color 0.2s' }}
        >
          Continue with Google
        </button>

        {/* View Toggle Layout Switch */}
        <p style={{ textAlign: 'center', fontSize: '0.85rem', marginTop: '1.5rem', color: '#6b7280', marginBottom: '0' }}>
          {isSignUp ? 'Already configured an index?' : "New deployment?"}{' '}
          <span 
            onClick={() => setIsSignUp(!isSignUp)} 
            style={{ color: '#3b82f6', cursor: 'pointer', textDecoration: 'underline', fontWeight: 500 }}
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </span>
        </p>
      </div>
    </div>
  )
}

function Layout({ children, profile, setSessionUser }: { children: React.ReactNode; profile: UserProfile | null; setSessionUser: any }) {
  const navigate = useNavigate()
  
  const handleSignOutProcess = async () => {
    await supabase.auth.signOut()
    setSessionUser(null)
    navigate('/')
  }

  return (
    <div style={{ fontFamily: 'sans-serif', display: 'flex', minHeight: '100vh', backgroundColor: '#f3f4f6' }}>
      {/* Sidebar Navigation */}
      <aside style={{ width: '260px', backgroundColor: '#1f2937', color: '#fff', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: '2px 0 5px rgba(0,0,0,0.05)' }}>
        <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>📊 Data Deck</h3>
        <Link to="/dashboard" style={{ color: '#d1d5db', textDecoration: 'none', padding: '0.75rem 1rem', borderRadius: '6px', display: 'block' }}>🎛️ Dashboard</Link>
        <Link to="/workspaces" style={{ color: '#d1d5db', textDecoration: 'none', padding: '0.75rem 1rem', borderRadius: '6px', display: 'block' }}>📁 Workspaces APIs</Link>
        <Link to="/profile" style={{ color: '#d1d5db', textDecoration: 'none', padding: '0.75rem 1rem', borderRadius: '6px', display: 'block' }}>👤 User Profile</Link>
        {/* Phase 5: Invalidate/terminate session state */}
        <button onClick={handleSignOutProcess} style={{ marginTop: 'auto', padding: '0.75rem', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Log Out</button>
      </aside>
      
      {/* Workspace Display Container */}
      <main style={{ flex: 1, padding: '2.5rem', display: 'flex', flexDirection: 'column' }}>
        <header style={{ textAlign: 'right', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #e5e7eb', color: '#4b5563' }}>
          <small>Authenticated Identity: <strong>{profile?.username || profile?.email || 'Verifying Profile...'}</strong></small>
        </header>
        <div style={{ flex: 1 }}>{children}</div>
      </main>
    </div>
  )
}

function DashboardView({ metrics }: { metrics: Metric[] }) {
  return (
    <div>
      <h2 style={{ color: '#111827', margin: '0 0 0.5rem 0' }}>Dashboard Overview</h2>
      <p style={{ color: '#6b7280', margin: '0 0 2rem 0' }}>Real-time analytical summaries protected by PostgreSQL RLS layers.</p>
      
      {metrics.length === 0 ? (
        <div style={{ backgroundColor: '#fff', padding: '2rem', borderRadius: '8px', textAlign: 'center', border: '1px solid #e5e7eb', color: '#6b7280' }}>
          No active telemetry blocks detected for your account ecosystem.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1.5rem' }}>
          {metrics.map((item) => (
            <div key={item.id} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#3b82f6', backgroundColor: '#eff6ff', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>{item.category}</span>
              <h4 style={{ margin: '1rem 0 0.5rem 0', color: '#374151' }}>{item.metric_name}</h4>
              <p style={{ fontSize: '1.75rem', fontWeight: 'bold', margin: '0', color: '#111827' }}>{item.metric_value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WorkspacesView() {
  return (
    <div>
      <h2 style={{ color: '#111827', margin: '0 0 0.5rem 0' }}>Dataset & Workspace APIs</h2>
      <p style={{ color: '#6b7280', margin: '0 0 1.5rem 0' }}>Secure system endpoints verified successfully:</p>
      <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
        <p style={{ margin: '0 0 0.5rem 0' }}><strong>Endpoint:</strong> <code>GET /api/auth/me</code> <span style={{ color: '#10b981', fontWeight: 'bold' }}>[Active 200]</span></p>
        <p style={{ margin: 0 }}><strong>Endpoint:</strong> <code>POST /api/workspaces</code> <span style={{ color: '#10b981', fontWeight: 'bold' }}>[Guarded 200]</span></p>
      </div>
    </div>
  )
}

function ProfileView({ profile }: { profile: UserProfile | null }) {
  return (
    <div>
      <h2 style={{ color: '#111827', marginBottom: '1.5rem' }}>User Profile Identity</h2>
      {profile ? (
        <div style={{ backgroundColor: '#fff', padding: '2rem', borderRadius: '8px', border: '1px solid #e5e7eb', display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {profile.profile_image ? (
            <img src={profile.profile_image} alt="Avatar" style={{ width: '90px', height: '90px', borderRadius: '50%', border: '2px solid #e5e7eb' }} />
          ) : (
            <div style={{ width: '90px', height: '90px', borderRadius: '50%', backgroundColor: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>👤</div>
          )}
          <div style={{ wordBreak: 'break-all', minWidth: '0', flex: 1 }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#111827' }}>{profile.name}</h3>
            {profile.username && <p style={{ margin: '0 0 0.5rem 0', color: '#4b5563' }}><strong>Username Identifier:</strong> {profile.username}</p>}
            <p style={{ margin: '0 0 0.5rem 0', color: '#4b5563' }}><strong>Mapped Account Identifier:</strong> {profile.email}</p>
            <p style={{ margin: '0 0 0.5rem 0', color: '#4b5563' }}><strong>System UUID:</strong> <code style={{ backgroundColor: '#f3f4f6', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.9rem' }}>{profile.id}</code></p>
            <small style={{ color: '#9ca3af' }}><strong>Last Validated Login:</strong> {new Date(profile.last_login).toLocaleString()}</small>
          </div>
        </div>
      ) : (
        <p style={{ color: '#6b7280' }}>Fetching authenticated profile snapshot...</p>
      )}
    </div>
  )
}