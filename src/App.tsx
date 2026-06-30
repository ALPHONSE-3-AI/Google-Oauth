import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export default function App() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1. Check if a user session already exists when page loads
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setLoading(false)
    })

    // 2. Listen for auth state changes (login or logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Triggers the Google Auth Flow
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Redirects users right back to your local environment after clicking login
        redirectTo: window.location.origin, 
      },
    })
    if (error) console.error('Error logging in:', error.message)
  }

  // Signs out the user
  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
        <h3>Initializing secure channel...</h3>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif', backgroundColor: '#f9fafb' }}>
      <div style={{ padding: '40px', background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'center', width: '350px' }}>
        
        {!user ? (
          // State A: Show Google Sign-in Button
          <>
            <h2 style={{ marginBottom: '10px', color: '#1f2937' }}>DataDeck Portal</h2>
            <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '30px' }}>Please sign in to continue</p>
            <button 
              onClick={handleGoogleLogin}
              style={{ width: '100%', padding: '12px', background: '#4285F4', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', transition: 'background 0.2s' }}
              onMouseOver={(e) => (e.currentTarget.style.background = '#357ae8')}
              onMouseOut={(e) => (e.currentTarget.style.background = '#4285F4')}
            >
              Sign in with Google
            </button>
          </>
        ) : (
          // State B: Authenticated View
          <>
            <h2 style={{ color: '#10B981', marginBottom: '10px' }}>Authenticated!</h2>
            <p style={{ color: '#4b5563', fontSize: '14px', marginBottom: '20px' }}>
              Logged in as: <br/><strong style={{ color: '#111827' }}>{user.email}</strong>
            </p>
            <button 
              onClick={handleLogout}
              style={{ width: '100%', padding: '10px', background: '#EF4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
            >
              Sign Out
            </button>
          </>
        )}

      </div>
    </div>
  )
}