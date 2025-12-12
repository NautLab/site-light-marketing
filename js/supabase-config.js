/**
 * Supabase Configuration
 * Light Marketing - Authentication System
 */

// Supabase credentials
const SUPABASE_URL = 'https://tyymvawnrapoirshxskj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5eW12YXducmFwb2lyc2h4c2tqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0NTc3NzQsImV4cCI6MjA4MTAzMzc3NH0.K43mjTGurBle5cwDjjehX8GRxBFYXKW3V4se4gtHaWc';

// Check if user previously checked "remember me"
const shouldRemember = localStorage.getItem('sb-remember-me') === 'true';

// Custom storage that uses sessionStorage by default, but localStorage if "remember me" was checked
const customStorage = {
    getItem: (key) => {
        if (shouldRemember) {
            return localStorage.getItem(key) || sessionStorage.getItem(key);
        }
        return sessionStorage.getItem(key);
    },
    setItem: (key, value) => {
        if (shouldRemember) {
            localStorage.setItem(key, value);
        }
        sessionStorage.setItem(key, value);
    },
    removeItem: (key) => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
    }
};

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        storageKey: 'sb-auth-token',
        storage: customStorage,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});

// Site URL for redirects (password reset, email confirmation)
const SITE_URL = window.location.origin;

// Restore session from persistent storage if "remember me" was checked
(async function restoreSession() {
    if (shouldRemember) {
        const persistentSession = localStorage.getItem('sb-auth-token-persistent');
        if (persistentSession) {
            try {
                const session = JSON.parse(persistentSession);
                if (session && session.access_token) {
                    await supabase.auth.setSession({
                        access_token: session.access_token,
                        refresh_token: session.refresh_token
                    });
                }
            } catch (e) {
                console.error('Error restoring session:', e);
                localStorage.removeItem('sb-auth-token-persistent');
            }
        }
    }
})();

