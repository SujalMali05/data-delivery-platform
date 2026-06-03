export type ThemeMode = 'dark' | 'light';
export type AccentPreset = 'indigo' | 'emerald' | 'cyan' | 'amber' | 'crimson';
export type VibrancyProfile = 'slate' | 'vibrant' | 'glass';

export interface ThemeSettings {
  mode: ThemeMode;
  accent: AccentPreset;
  vibrancy: VibrancyProfile;
}

export const ACCENTS: Record<ThemeMode, Record<AccentPreset, { accent: string; glow: string; gradient: string }>> = {
  dark: {
    indigo: {
      accent: '#6366f1',
      glow: '#6366f133',
      gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    },
    emerald: {
      accent: '#10b981',
      glow: '#10b98133',
      gradient: 'linear-gradient(135deg, #10b981, #059669)',
    },
    cyan: {
      accent: '#00d2ff',
      glow: 'rgba(0, 210, 255, 0.2)',
      gradient: 'linear-gradient(135deg, #00d2ff, #0072ff)',
    },
    amber: {
      accent: '#f59e0b',
      glow: '#f59e0b33',
      gradient: 'linear-gradient(135deg, #f59e0b, #e65c00)',
    },
    crimson: {
      accent: '#f43f5e',
      glow: '#f43f5e33',
      gradient: 'linear-gradient(135deg, #f43f5e, #be123c)',
    },
  },
  light: {
    indigo: {
      accent: '#4f46e5',
      glow: 'rgba(79, 70, 229, 0.12)',
      gradient: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    },
    emerald: {
      accent: '#059669',
      glow: 'rgba(5, 150, 105, 0.12)',
      gradient: 'linear-gradient(135deg, #059669, #047857)',
    },
    cyan: {
      accent: '#0891b2',
      glow: 'rgba(8, 145, 178, 0.12)',
      gradient: 'linear-gradient(135deg, #0891b2, #1d4ed8)',
    },
    amber: {
      accent: '#d97706',
      glow: 'rgba(217, 119, 6, 0.12)',
      gradient: 'linear-gradient(135deg, #d97706, #b45309)',
    },
    crimson: {
      accent: '#e11d48',
      glow: 'rgba(225, 29, 72, 0.12)',
      gradient: 'linear-gradient(135deg, #e11d48, #be123c)',
    },
  },
};

export const VIBRANCY_PROFILES: Record<ThemeMode, Record<VibrancyProfile, Record<string, string>>> = {
  dark: {
    slate: {}, // Inherits standard css variables
    vibrant: {
      '--bg-primary': '#020208',
      '--bg-secondary': '#070718',
      '--bg-tertiary': '#0f0f30',
      '--bg-card': '#0a0a1a',
      '--bg-card-hover': '#10102a',
      '--border-primary': '#1f1f3e',
      '--border-secondary': '#12122b',
      '--border-accent': '#2b2b60',
    },
    glass: {
      '--bg-primary': 'linear-gradient(135deg, #050510, #0a0a1a)',
      '--bg-secondary': 'rgba(17, 17, 27, 0.4)',
      '--bg-tertiary': 'rgba(26, 26, 38, 0.5)',
      '--bg-card': 'rgba(19, 19, 30, 0.65)',
      '--bg-card-hover': 'rgba(26, 26, 42, 0.75)',
      '--border-primary': 'rgba(59, 59, 92, 0.3)',
      '--border-secondary': 'rgba(59, 59, 92, 0.2)',
      '--border-accent': 'rgba(59, 59, 92, 0.4)',
    },
  },
  light: {
    slate: {}, // Inherits standard css variables
    vibrant: {
      '--bg-primary': '#f3f4f6',
      '--bg-secondary': '#eef2ff',
      '--bg-tertiary': '#e0e7ff',
      '--bg-card': '#ffffff',
      '--bg-card-hover': '#f8fafc',
      '--border-primary': '#cbd5e1',
      '--border-secondary': '#e2e8f0',
      '--border-accent': '#a5b4fc',
      '--text-primary': '#0f172a',
      '--text-secondary': '#475569',
    },
    glass: {
      '--bg-primary': 'linear-gradient(135deg, #f8fafc, #e2e8f0)',
      '--bg-secondary': 'rgba(255, 255, 255, 0.4)',
      '--bg-tertiary': 'rgba(255, 255, 255, 0.5)',
      '--bg-card': 'rgba(255, 255, 255, 0.65)',
      '--bg-card-hover': 'rgba(255, 255, 255, 0.75)',
      '--border-primary': 'rgba(148, 163, 184, 0.25)',
      '--border-secondary': 'rgba(148, 163, 184, 0.15)',
      '--border-accent': 'rgba(148, 163, 184, 0.35)',
    },
  },
};

const OVERRIDDEN_VAR_NAMES = [
  '--bg-primary',
  '--bg-secondary',
  '--bg-tertiary',
  '--bg-card',
  '--bg-card-hover',
  '--border-primary',
  '--border-secondary',
  '--border-accent',
  '--text-primary',
  '--text-secondary',
  '--accent-blue',
  '--accent-blue-glow',
  '--gradient-primary',
];

export function applyThemeSettings(settings: ThemeSettings) {
  if (typeof window === 'undefined') return;

  const doc = document.documentElement;

  // 1. Set mode attribute
  doc.setAttribute('data-theme', settings.mode);

  // 2. Clear old style overrides
  OVERRIDDEN_VAR_NAMES.forEach((v) => doc.style.removeProperty(v));

  // 3. Apply Accent configuration overrides
  const accentConf = ACCENTS[settings.mode][settings.accent];
  if (accentConf) {
    doc.style.setProperty('--accent-blue', accentConf.accent);
    doc.style.setProperty('--accent-blue-glow', accentConf.glow);
    doc.style.setProperty('--gradient-primary', accentConf.gradient);
  }

  // 4. Apply Vibrancy overrides
  const vibrancyConf = VIBRANCY_PROFILES[settings.mode][settings.vibrancy];
  if (vibrancyConf) {
    Object.entries(vibrancyConf).forEach(([key, val]) => {
      doc.style.setProperty(key, val);
    });
  }
}

export function getSavedThemeSettings(): ThemeSettings {
  if (typeof window === 'undefined') {
    return { mode: 'dark', accent: 'indigo', vibrancy: 'slate' };
  }

  const mode = (localStorage.getItem('ddp_theme') as ThemeMode) || 'dark';
  const accent = (localStorage.getItem('ddp_theme_accent') as AccentPreset) || 'indigo';
  const vibrancy = (localStorage.getItem('ddp_theme_vibrancy') as VibrancyProfile) || 'slate';

  return { mode, accent, vibrancy };
}

export function saveThemeSettings(settings: ThemeSettings) {
  if (typeof window === 'undefined') return;

  localStorage.setItem('ddp_theme', settings.mode);
  localStorage.setItem('ddp_theme_accent', settings.accent);
  localStorage.setItem('ddp_theme_vibrancy', settings.vibrancy);

  applyThemeSettings(settings);
  window.dispatchEvent(new Event('ddp_theme_change'));
}
