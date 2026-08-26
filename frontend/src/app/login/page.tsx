'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api-client';
import { getSavedThemeSettings, saveThemeSettings } from '@/lib/theme';
import CosmicBackground from '@/components/CosmicBackground';
import {
  ArrowRight,
  Cloud,
  Database,
  Shield,
  Loader2,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Lock,
  Mail,
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const currentSettings = getSavedThemeSettings();
    setTheme(currentSettings.mode);
    const syncTheme = () => setTheme(getSavedThemeSettings().mode);
    window.addEventListener('ddp_theme_change', syncTheme);
    return () => window.removeEventListener('ddp_theme_change', syncTheme);
  }, []);

  const toggleTheme = () => {
    const settings = getSavedThemeSettings();
    saveThemeSettings({ ...settings, mode: settings.mode === 'dark' ? 'light' : 'dark' });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await authApi.login(email, password);
      localStorage.setItem('ddp_token', response.data.accessToken);
      localStorage.setItem('ddp_user', JSON.stringify(response.data.user));
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const isDark = theme === 'dark';

  return (
    <div className={`login-cosmic-root ${mounted && theme === 'light' ? 'theme-light' : 'theme-dark'}`}>
      {/* ═══ Full-Screen Cosmic Background ═══ */}
      <div className="login-canvas-container">
        <CosmicBackground text="DATABRIDGE" />
      </div>

      {/* Floating Nebula Orbs */}
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
      <div className="login-orb login-orb-3" />
      <div className="login-orb login-orb-4" />

      {/* Subtle grid overlay for cyberpunk feel */}
      <div className="login-grid-overlay">
        <div className="login-grid-node node-1" style={{ top: '20%', left: '30%' }} />
        <div className="login-grid-node node-2" style={{ top: '45%', left: '68%' }} />
        <div className="login-grid-node node-3" style={{ top: '70%', left: '22%' }} />
        <div className="login-grid-node node-4" style={{ top: '82%', left: '58%' }} />
        <div className="login-grid-node node-5" style={{ top: '15%', left: '88%' }} />
        <div className="login-grid-node node-6" style={{ top: '60%', left: '12%' }} />
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="login-theme-toggle"
        title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      {/* ═══ Split Screen Container ═══ */}
      <div className="login-split-container">
        {/* Left Side: Visual Showcase & Title space */}
        <div className="login-left-panel">
        </div>

        {/* Right Side: Form Panel */}
        <div className="login-right-panel">
          <div className="login-card-wrapper">
            {/* Animated gradient border glow */}
            <div className="login-card-glow" />

            <div className="login-card animate-card-float">
              {/* Logo */}
              <div className="login-logo-section">
                <div className="login-logo-icon">
                  <Database size={22} color="white" />
                  <div className="login-logo-pulse" />
                </div>
                <div>
                  <h1 className="login-logo-title">DataBridge</h1>
                  <p className="login-logo-subtitle">Enterprise Data Delivery</p>
                </div>
              </div>

              {/* Decorative line */}
              <div className="login-divider">
                <div className="login-divider-line" />
                <span className="login-divider-text">AUTHENTICATION REGISTRY</span>
                <div className="login-divider-line" />
              </div>

              {/* Form */}
              <form onSubmit={handleLogin} className="login-form">
                {/* Email */}
                <div className="login-field">
                  <label className="login-label">Security Identifier (Email)</label>
                  <div className="login-input-wrapper">
                    <span className="login-input-icon"><Mail size={16} /></span>
                    <input
                      id="login-email"
                      type="email"
                      className="login-input"
                      placeholder="admin@yourcompany.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                    <div className="login-input-glow" />
                  </div>
                </div>

                {/* Password */}
                <div className="login-field">
                  <label className="login-label">Access Credentials (Password)</label>
                  <div className="login-input-wrapper">
                    <span className="login-input-icon"><Lock size={16} /></span>
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      className="login-input"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="login-eye-btn"
                      title={showPassword ? 'Hide' : 'Show'}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    <div className="login-input-glow" />
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="login-error">
                    <div className="login-error-dot" />
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button
                  id="login-submit"
                  type="submit"
                  className="login-submit-btn"
                  disabled={loading}
                >
                  <span className="login-submit-bg" />
                  <span className="login-submit-content">
                    {loading ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <>
                        Login to Account
                        <ArrowRight size={16} />
                      </>
                    )}
                  </span>
                </button>
              </form>

              {/* Feature badges */}
              <div className="login-badges">
                <div className="login-badge">
                  <Cloud size={13} />
                  <span>Google Drive</span>
                </div>
                <div className="login-badge-separator" />
                <div className="login-badge">
                  <Shield size={13} />
                  <span>AWS STS</span>
                </div>
                <div className="login-badge-separator" />
                <div className="login-badge">
                  <Database size={13} />
                  <span>S3 Delivery</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="login-bottom-bar">
        <span>HOVER & CLICK TO INTERACT</span>
        <span className="login-bottom-sep">•</span>
        <span>v1.0.4</span>
      </div>

      {/* ═══ All styles scoped to login page ═══ */}
      <style>{`
        /* ── Root & Themes ──────────────────────────────── */
        .login-cosmic-root {
          min-height: 100vh;
          width: 100vw;
          display: flex;
          position: relative;
          overflow: hidden;
          font-family: 'Inter', -apple-system, sans-serif;
          transition: background 0.5s ease;
        }

        .login-cosmic-root.theme-dark {
          background: #020208;
          background: linear-gradient(135deg, #020208 0%, #050518 50%, #0c0828 100%);
        }

        .login-cosmic-root.theme-light {
          background: #f5f7ff;
          background: linear-gradient(135deg, #f5f3ff 0%, #e0e7ff 40%, #e8f2ff 75%, #fae8ff 100%);
        }

        /* ── Canvas Container ──────────────────────────── */
        .login-canvas-container {
          position: absolute;
          inset: 0;
          z-index: 0;
        }

        /* ── Grid Overlay ──────────────────────────────── */
        .login-grid-overlay {
          position: absolute;
          inset: 0;
          background-size: 60px 60px;
          pointer-events: none;
          z-index: 1;
        }
        .theme-dark .login-grid-overlay {
          background-image:
            linear-gradient(rgba(99, 102, 241, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99, 102, 241, 0.03) 1px, transparent 1px);
        }
        .theme-light .login-grid-overlay {
          background-image:
            linear-gradient(rgba(99, 102, 241, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99, 102, 241, 0.03) 1px, transparent 1px);
        }

        /* Star Map Node junctions */
        .login-grid-node {
          position: absolute;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          pointer-events: none;
          z-index: 2;
        }
        .theme-dark .login-grid-node {
          background: #6366f1;
          box-shadow: 0 0 6px #6366f1, 0 0 12px #6366f1;
        }
        .theme-light .login-grid-node {
          background: #4f46e5;
          box-shadow: 0 0 6px rgba(79, 70, 229, 0.4), 0 0 12px rgba(79, 70, 229, 0.2);
        }
        .node-1 { animation: twinkle-node 4s infinite ease-in-out; }
        .node-2 { animation: twinkle-node 6s infinite ease-in-out 1s; }
        .node-3 { animation: twinkle-node 5s infinite ease-in-out 2s; }
        .node-4 { animation: twinkle-node 7s infinite ease-in-out 0.5s; }
        .node-5 { animation: twinkle-node 4.5s infinite ease-in-out 3s; }
        .node-6 { animation: twinkle-node 5.5s infinite ease-in-out 1.5s; }

        @keyframes twinkle-node {
          0%, 100% { opacity: 0.15; transform: scale(0.7); }
          50% { opacity: 0.85; transform: scale(1.2); }
        }

        /* ── Nebula Orbs ───────────────────────────────── */
        .login-orb {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          z-index: 1;
          filter: blur(80px);
          transition: background 0.5s ease, opacity 0.5s ease;
        }
        .login-orb-1 {
          top: -5%;
          left: -5%;
          width: 500px;
          height: 500px;
          animation: float-orb-1 20s infinite alternate ease-in-out;
        }
        .theme-dark .login-orb-1 {
          background: radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%);
        }
        .theme-light .login-orb-1 {
          background: radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%);
        }

        .login-orb-2 {
          bottom: -10%;
          right: -5%;
          width: 600px;
          height: 600px;
          animation: float-orb-2 18s infinite alternate ease-in-out;
        }
        .theme-dark .login-orb-2 {
          background: radial-gradient(circle, rgba(168,85,247,0.1) 0%, transparent 70%);
        }
        .theme-light .login-orb-2 {
          background: radial-gradient(circle, rgba(244,114,182,0.08) 0%, transparent 70%);
        }

        .login-orb-3 {
          top: 40%;
          right: 20%;
          width: 350px;
          height: 350px;
          animation: float-orb-3 22s infinite alternate ease-in-out;
        }
        .theme-dark .login-orb-3 {
          background: radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%);
        }
        .theme-light .login-orb-3 {
          background: radial-gradient(circle, rgba(45,212,191,0.06) 0%, transparent 70%);
        }

        .login-orb-4 {
          bottom: 20%;
          left: 15%;
          width: 400px;
          height: 400px;
          animation: float-orb-1 25s infinite alternate-reverse ease-in-out;
        }
        .theme-dark .login-orb-4 {
          background: radial-gradient(circle, rgba(236,72,153,0.06) 0%, transparent 70%);
        }
        .theme-light .login-orb-4 {
          background: radial-gradient(circle, rgba(236,72,153,0.05) 0%, transparent 70%);
        }

        /* ── Theme Toggle ──────────────────────────────── */
        .login-theme-toggle {
          position: absolute;
          top: 20px;
          right: 20px;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s ease;
          z-index: 20;
          outline: none;
        }
        .theme-dark .login-theme-toggle {
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.5);
        }
        .theme-light .login-theme-toggle {
          border: 1px solid rgba(99,102,241,0.15);
          background: rgba(255,255,255,0.7);
          color: rgba(99,102,241,0.6);
        }
        .theme-dark .login-theme-toggle:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(99,102,241,0.4);
          color: rgba(255,255,255,0.8);
          box-shadow: 0 0 20px rgba(99,102,241,0.15);
        }
        .theme-light .login-theme-toggle:hover {
          background: #ffffff;
          border-color: rgba(99,102,241,0.4);
          color: rgba(99,102,241,0.9);
          box-shadow: 0 0 20px rgba(99,102,241,0.12);
        }

        /* ── Split Layout Containers ────────────────────── */
        .login-split-container {
          position: relative;
          display: flex;
          width: 100vw;
          min-height: 100vh;
          z-index: 10;
        }

        /* ── Left Panel ── */
        .login-left-panel {
          width: 55%;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 60px;
          pointer-events: none; /* Make clicks register on canvas underneath */
          position: relative;
          z-index: 5;
        }

        .login-hud-indicators {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .login-hud-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .theme-dark .login-hud-dot {
          background: #6366f1;
          box-shadow: 0 0 8px rgba(99,102,241,0.6);
        }
        .theme-light .login-hud-dot {
          background: #4f46e5;
          box-shadow: 0 0 8px rgba(79,70,229,0.6);
        }

        .login-hud-text {
          font-family: monospace;
          font-size: 11px;
          letter-spacing: 0.15em;
          font-weight: 600;
        }
        .theme-dark .login-hud-text { color: rgba(255,255,255,0.4); }
        .theme-light .login-hud-text { color: rgba(0,0,0,0.5); }

        .login-left-tagline {
          max-width: 480px;
        }

        .login-hud-title {
          font-family: monospace;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.1em;
          margin-bottom: 12px;
        }
        .theme-dark .login-hud-title { color: rgba(99,102,241,0.8); }
        .theme-light .login-hud-title { color: rgba(79,70,229,0.9); }

        .login-hud-desc {
          font-size: 13px;
          line-height: 1.6;
          font-weight: 400;
        }
        .theme-dark .login-hud-desc { color: rgba(255,255,255,0.35); }
        .theme-light .login-hud-desc { color: rgba(0,0,0,0.55); }

        /* ── Right Panel ── */
        .login-right-panel {
          width: 45%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px;
          position: relative;
          z-index: 10;
          transition: all 0.5s ease;
        }
        .theme-dark .login-right-panel {
          background: rgba(4, 4, 12, 0.45);
          border-left: 1px solid rgba(99, 102, 241, 0.1);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .theme-light .login-right-panel {
          background: rgba(255, 255, 255, 0.35);
          border-left: 1px solid rgba(99, 102, 241, 0.08);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        /* ── Card Wrapper ──────────────────────────────── */
        .login-card-wrapper {
          position: relative;
          width: 100%;
          max-width: 410px;
          animation: login-card-fade-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes login-card-fade-in {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        /* ── Animated Gradient Border Glow ─────────────── */
        .login-card-glow {
          position: absolute;
          inset: -1px;
          border-radius: 21px;
          background: conic-gradient(
            from var(--login-glow-angle, 0deg),
            rgba(99,102,241,0.5),
            rgba(168,85,247,0.3),
            rgba(6,182,212,0.4),
            rgba(236,72,153,0.3),
            rgba(99,102,241,0.5)
          );
          z-index: -1;
          opacity: 0.6;
          filter: blur(1px);
          animation: login-glow-spin 6s linear infinite;
        }
        .theme-light .login-card-glow {
          background: conic-gradient(
            from var(--login-glow-angle, 0deg),
            rgba(99,102,241,0.25),
            rgba(168,85,247,0.15),
            rgba(6,182,212,0.2),
            rgba(236,72,153,0.15),
            rgba(99,102,241,0.25)
          );
          opacity: 0.45;
        }
        @property --login-glow-angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes login-glow-spin {
          to { --login-glow-angle: 360deg; }
        }

        /* ── Main Card ─────────────────────────────────── */
        .login-card {
          position: relative;
          padding: 36px 32px 28px;
          border-radius: 20px;
          transition: background 0.5s ease, border-color 0.5s ease, box-shadow 0.5s ease;
          width: 100%;
          overflow: hidden; /* Restrict shimmer to card borders */
        }
        .theme-dark .login-card {
          background: rgba(8, 8, 20, 0.75);
          backdrop-filter: blur(40px) saturate(150%);
          -webkit-backdrop-filter: blur(40px) saturate(150%);
          border: 1px solid rgba(255,255,255,0.06);
          box-shadow:
            0 30px 80px rgba(0,0,0,0.5),
            inset 0 1px 0 rgba(255,255,255,0.04),
            0 0 60px rgba(99,102,241,0.04);
        }
        .theme-light .login-card {
          background: rgba(255, 255, 255, 0.55);
          backdrop-filter: blur(30px) saturate(160%);
          -webkit-backdrop-filter: blur(30px) saturate(160%);
          border: 1px solid rgba(255, 255, 255, 0.5);
          box-shadow:
            0 25px 60px rgba(99, 102, 241, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.8),
            0 0 50px rgba(99, 102, 241, 0.02);
        }

        /* Premium light sweep reflection */
        .login-card::after {
          content: '';
          position: absolute;
          top: -150%;
          left: -150%;
          width: 300%;
          height: 300%;
          background: linear-gradient(
            105deg,
            transparent,
            rgba(255, 255, 255, 0) 40%,
            rgba(255, 255, 255, 0.08) 48%,
            rgba(255, 255, 255, 0.20) 50%,
            rgba(255, 255, 255, 0.08) 52%,
            rgba(255, 255, 255, 0) 60%,
            transparent
          );
          pointer-events: none;
          z-index: 5;
          animation: card-shimmer-sweep 12s infinite cubic-bezier(0.43, 0.13, 0.23, 0.96);
        }

        .theme-light .login-card::after {
          background: linear-gradient(
            105deg,
            transparent,
            rgba(255, 255, 255, 0) 40%,
            rgba(255, 255, 255, 0.12) 47%,
            rgba(255, 255, 255, 0.28) 50%,
            rgba(255, 255, 255, 0.12) 53%,
            rgba(255, 255, 255, 0) 60%,
            transparent
          );
        }

        @keyframes card-shimmer-sweep {
          0% {
            transform: translate(-30%, -30%);
          }
          100% {
            transform: translate(30%, 30%);
          }
        }

        /* ── Logo Section ──────────────────────────────── */
        .login-logo-section {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 24px;
        }
        .login-logo-icon {
          position: relative;
          width: 48px;
          height: 48px;
          border-radius: 14px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 6px 24px rgba(99, 102, 241, 0.35);
          transition: transform 0.3s ease;
        }
        .login-logo-icon:hover {
          transform: rotate(8deg) scale(1.05);
        }
        .login-logo-pulse {
          position: absolute;
          inset: -4px;
          border-radius: 18px;
          border: 2px solid rgba(99,102,241,0.3);
          animation: logo-pulse 2.5s ease-in-out infinite;
        }
        @keyframes logo-pulse {
          0%, 100% { opacity: 0; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.08); }
        }
        .login-logo-title {
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.5px;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          color: transparent;
          line-height: 1.2;
        }
        .theme-dark .login-logo-title {
          background-image: linear-gradient(135deg, #f0f0f5 0%, #a5b4fc 50%, #818cf8 100%);
        }
        .theme-light .login-logo-title {
          background-image: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4f46e5 100%);
        }

        .login-logo-subtitle {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-top: 2px;
        }
        .theme-dark .login-logo-subtitle { color: rgba(255,255,255,0.35); }
        .theme-light .login-logo-subtitle { color: rgba(79,70,229,0.7); }

        /* ── Divider ───────────────────────────────────── */
        .login-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
        }
        .login-divider-line {
          flex: 1;
          height: 1px;
        }
        .theme-dark .login-divider-line {
          background: linear-gradient(90deg, transparent, rgba(99,102,241,0.2), transparent);
        }
        .theme-light .login-divider-line {
          background: linear-gradient(90deg, transparent, rgba(79,70,229,0.2), transparent);
        }
        .login-divider-text {
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.15em;
        }
        .theme-dark .login-divider-text { color: rgba(99,102,241,0.55); }
        .theme-light .login-divider-text { color: rgba(79,70,229,0.7); }

        /* ── Form ──────────────────────────────────────── */
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .login-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .login-label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .theme-dark .login-label { color: rgba(255,255,255,0.35); }
        .theme-light .login-label { color: rgba(79,70,229,0.75); }

        .login-input-wrapper {
          position: relative;
        }
        .login-input-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          align-items: center;
          pointer-events: none;
          transition: color 0.3s ease;
          z-index: 2;
        }
        .theme-dark .login-input-icon { color: rgba(255,255,255,0.25); }
        .theme-light .login-input-icon { color: rgba(99,102,241,0.5); }

        .login-input {
          width: 100%;
          padding: 12px 14px 12px 42px;
          border-radius: 10px;
          font-size: 14px;
          font-family: inherit;
          outline: none;
          transition: all 0.3s ease;
          position: relative;
          z-index: 1;
        }
        .theme-dark .login-input {
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.03);
          color: #f0f0f5;
        }
        .theme-light .login-input {
          border: 1px solid rgba(99,102,241,0.15);
          background: rgba(255, 255, 255, 0.7);
          color: #312e81;
        }
        .theme-dark .login-input::placeholder { color: rgba(255,255,255,0.18); }
        .theme-light .login-input::placeholder { color: rgba(99,102,241,0.35); }

        .theme-dark .login-input:focus {
          border-color: rgba(99,102,241,0.5);
          background: rgba(99,102,241,0.04);
          box-shadow: 0 0 0 3px rgba(99,102,241,0.08), 0 0 20px rgba(99,102,241,0.06);
        }
        .theme-light .login-input:focus {
          border-color: rgba(99,102,241,0.4);
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.08), 0 0 20px rgba(99,102,241,0.04);
        }

        .login-input:focus + .login-eye-btn + .login-input-glow,
        .login-input:focus + .login-input-glow {
          opacity: 1;
        }

        .theme-dark .login-input-wrapper:focus-within .login-input-icon {
          color: rgba(99,102,241,0.7);
        }
        .theme-light .login-input-wrapper:focus-within .login-input-icon {
          color: rgba(79,70,229,0.9);
        }

        .login-input-glow {
          position: absolute;
          bottom: -1px;
          left: 0;
          right: 0;
          height: 2px;
          border-radius: 2px;
          opacity: 0;
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease;
          z-index: 2;
        }
        .theme-dark .login-input-glow {
          background: linear-gradient(90deg, rgba(99,102,241,0.1) 0%, #6366f1 50%, rgba(99,102,241,0.1) 100%);
        }
        .theme-light .login-input-glow {
          background: linear-gradient(90deg, rgba(79,70,229,0.1) 0%, #4f46e5 50%, rgba(79,70,229,0.1) 100%);
        }
        .login-input:focus + .login-eye-btn + .login-input-glow,
        .login-input:focus + .login-input-glow {
          opacity: 1;
          transform: scaleX(1);
        }

        .login-eye-btn {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 4px;
          outline: none;
          transition: color 0.2s ease;
          z-index: 2;
        }
        .theme-dark .login-eye-btn { color: rgba(255,255,255,0.25); }
        .theme-light .login-eye-btn { color: rgba(99,102,241,0.5); }
        .theme-dark .login-eye-btn:hover { color: rgba(255,255,255,0.5); }
        .theme-light .login-eye-btn:hover { color: rgba(79,70,229,0.9); }

        /* ── Error ─────────────────────────────────────── */
        .login-error {
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .theme-dark .login-error {
          background: rgba(239,68,68,0.06);
          border: 1px solid rgba(239,68,68,0.15);
          color: #f87171;
        }
        .theme-light .login-error {
          background: rgba(220,38,38,0.05);
          border: 1px solid rgba(220,38,38,0.12);
          color: #b91c1c;
        }
        .login-error-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
          animation: error-blink 1.5s ease-in-out infinite;
        }
        .theme-dark .login-error-dot { background: #f87171; }
        .theme-light .login-error-dot { background: #dc2626; }

        @keyframes error-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        /* ── Submit Button ─────────────────────────────── */
        .login-submit-btn {
          position: relative;
          width: 100%;
          padding: 14px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          overflow: hidden;
          margin-top: 4px;
          transition: all 0.3s ease;
          outline: none;
          background: transparent;
        }
        .login-submit-btn:disabled {
          cursor: wait;
          opacity: 0.7;
        }
        .login-submit-bg {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #6366f1, #8b5cf6, #6366f1);
          background-size: 200% 100%;
          animation: btn-shimmer 3s ease-in-out infinite;
          border-radius: 12px;
          z-index: 0;
        }
        @keyframes btn-shimmer {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .login-submit-content {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: white;
          font-size: 14px;
          font-weight: 600;
          font-family: inherit;
        }
        .login-submit-btn:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 30px rgba(99,102,241,0.35), 0 0 40px rgba(99,102,241,0.15);
        }
        .login-submit-btn:not(:disabled):active {
          transform: translateY(0);
        }

        /* ── Feature Badges ────────────────────────────── */
        .login-badges {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid;
          transition: border-color 0.5s ease;
        }
        .theme-dark .login-badges { border-color: rgba(255,255,255,0.04); }
        .theme-light .login-badges { border-color: rgba(0,0,0,0.04); }

        .login-badge {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 500;
          transition: color 0.3s ease;
        }
        .theme-dark .login-badge { color: rgba(255,255,255,0.25); }
        .theme-light .login-badge { color: rgba(0,0,0,0.4); }

        .login-badge:nth-child(1) svg { color: #06b6d4; }
        .login-badge:nth-child(3) svg { color: #a855f7; }
        .login-badge:nth-child(5) svg { color: #10b981; }

        .theme-dark .login-badge:hover { color: rgba(255,255,255,0.5); }
        .theme-light .login-badge:hover { color: rgba(0,0,0,0.75); }

        .login-badge-separator {
          width: 3px;
          height: 3px;
          border-radius: 50%;
        }
        .theme-dark .login-badge-separator { background: rgba(255,255,255,0.1); }
        .theme-light .login-badge-separator { background: rgba(0,0,0,0.1); }

        /* ── Bottom Bar ────────────────────────────────── */
        .login-bottom-bar {
          position: absolute;
          bottom: 16px;
          left: 0;
          right: 0;
          text-align: center;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          font-weight: 500;
          pointer-events: none;
        }
        .theme-light .login-submit-bg {
          background: linear-gradient(135deg, #4f46e5, #7c3aed, #4f46e5);
        }
        @keyframes btn-shimmer {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .login-submit-content {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: white;
          font-size: 14px;
          font-weight: 600;
          font-family: inherit;
        }
        .login-submit-btn:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 30px rgba(99,102,241,0.35), 0 0 40px rgba(99,102,241,0.15);
        }
        .theme-light .login-submit-btn:not(:disabled):hover {
          box-shadow: 0 8px 25px rgba(79, 70, 229, 0.25), 0 0 35px rgba(79, 70, 229, 0.1);
        }
        .login-submit-btn:not(:disabled):active {
          transform: translateY(0);
        }

        /* ── Feature Badges ────────────────────────────── */
        .login-badges {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid;
          transition: border-color 0.5s ease;
        }
        .theme-dark .login-badges { border-color: rgba(255,255,255,0.04); }
        .theme-light .login-badges { border-color: rgba(0,0,0,0.04); }

        .login-badge {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 500;
          transition: color 0.3s ease;
        }
        .theme-dark .login-badge { color: rgba(255,255,255,0.25); }
        .theme-light .login-badge { color: rgba(79,70,229,0.7); }

        .login-badge:nth-child(1) svg { color: #06b6d4; }
        .login-badge:nth-child(3) svg { color: #a855f7; }
        .login-badge:nth-child(5) svg { color: #10b981; }

        .theme-dark .login-badge:hover { color: rgba(255,255,255,0.5); }
        .theme-light .login-badge:hover { color: #4f46e5; }

        .login-badge-separator {
          width: 3px;
          height: 3px;
          border-radius: 50%;
        }
        .theme-dark .login-badge-separator { background: rgba(255,255,255,0.1); }
        .theme-light .login-badge-separator { background: rgba(0,0,0,0.1); }

        /* ── Bottom Bar ────────────────────────────────── */
        .login-bottom-bar {
          position: absolute;
          bottom: 16px;
          left: 0;
          right: 0;
          text-align: center;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          font-weight: 500;
          pointer-events: none;
        }
        .theme-dark .login-bottom-bar { color: rgba(255,255,255,0.15); }
        .theme-light .login-bottom-bar { color: rgba(79,70,229,0.6); }

        .login-bottom-sep {
          color: rgba(99,102,241,0.3);
        }

        /* ── Responsive ────────────────────────────────── */
        @media (max-width: 900px) {
          .login-left-panel {
            display: none;
          }
          .login-right-panel {
            width: 100%;
            background: transparent !important;
            border-left: none !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
          }
          .login-card-wrapper {
            max-width: 100%;
            padding: 0 16px;
          }
          .login-card {
            padding: 28px 20px 24px;
          }
        }
      `}</style>
    </div>
  );
}
