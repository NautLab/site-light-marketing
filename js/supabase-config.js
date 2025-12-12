/**
 * Supabase Configuration
 * Light Marketing - Authentication System
 */

// Supabase credentials
const SUPABASE_URL = 'https://tyymvawnrapoirshxskj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5eW12YXducmFwb2lyc2h4c2tqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0NTc3NzQsImV4cCI6MjA4MTAzMzc3NH0.K43mjTGurBle5cwDjjehX8GRxBFYXKW3V4se4gtHaWc';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Site URL for redirects (password reset, email confirmation)
const SITE_URL = window.location.origin;
