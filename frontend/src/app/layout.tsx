import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Data Delivery Platform — Internal Transfer Management",
  description:
    "Securely transfer large-scale data from Google Drive to Customer AWS S3 via rclone and AssumeRole",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var mode = localStorage.getItem('ddp_theme') || 'light';
                var accent = localStorage.getItem('ddp_theme_accent') || 'indigo';
                var vibrancy = localStorage.getItem('ddp_theme_vibrancy') || 'vibrant';
                
                document.documentElement.setAttribute('data-theme', mode);
                
                var ACCENTS = {
                  dark: {
                    indigo: ['#6366f1', '#6366f133', 'linear-gradient(135deg, #6366f1, #8b5cf6)'],
                    emerald: ['#10b981', '#10b98133', 'linear-gradient(135deg, #10b981, #059669)'],
                    cyan: ['#00d2ff', 'rgba(0, 210, 255, 0.2)', 'linear-gradient(135deg, #00d2ff, #0072ff)'],
                    amber: ['#f59e0b', '#f59e0b33', 'linear-gradient(135deg, #f59e0b, #e65c00)'],
                    crimson: ['#f43f5e', '#f43f5e33', 'linear-gradient(135deg, #f43f5e, #be123c)']
                  },
                  light: {
                    indigo: ['#4f46e5', 'rgba(79, 70, 229, 0.12)', 'linear-gradient(135deg, #4f46e5, #7c3aed)'],
                    emerald: ['#059669', 'rgba(5, 150, 105, 0.12)', 'linear-gradient(135deg, #059669, #047857)'],
                    cyan: ['#0891b2', 'rgba(8, 145, 178, 0.12)', 'linear-gradient(135deg, #0891b2, #1d4ed8)'],
                    amber: ['#d97706', 'rgba(217, 119, 6, 0.12)', 'linear-gradient(135deg, #d97706, #b45309)'],
                    crimson: ['#e11d48', 'rgba(225, 29, 72, 0.12)', 'linear-gradient(135deg, #e11d48, #be123c)']
                  }
                };
                
                var VIBRANCY = {
                  dark: {
                    slate: {},
                    vibrant: {
                      '--bg-primary': '#020208',
                      '--bg-secondary': '#070718',
                      '--bg-tertiary': '#0f0f30',
                      '--bg-card': '#0a0a1a',
                      '--bg-card-hover': '#10102a',
                      '--border-primary': '#1f1f3e',
                      '--border-secondary': '#12122b',
                      '--border-accent': '#2b2b60'
                    },
                    glass: {
                      '--bg-primary': 'linear-gradient(135deg, #050510, #0a0a1a)',
                      '--bg-secondary': 'rgba(17, 17, 27, 0.4)',
                      '--bg-tertiary': 'rgba(26, 26, 38, 0.5)',
                      '--bg-card': 'rgba(19, 19, 30, 0.65)',
                      '--bg-card-hover': 'rgba(26, 26, 42, 0.75)',
                      '--border-primary': 'rgba(59, 59, 92, 0.3)',
                      '--border-secondary': 'rgba(59, 59, 92, 0.2)',
                      '--border-accent': 'rgba(59, 59, 92, 0.4)'
                    }
                  },
                  light: {
                    slate: {},
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
                      '--text-secondary': '#475569'
                    },
                    glass: {
                      '--bg-primary': 'linear-gradient(135deg, #f8fafc, #e2e8f0)',
                      '--bg-secondary': 'rgba(255, 255, 255, 0.4)',
                      '--bg-tertiary': 'rgba(255, 255, 255, 0.5)',
                      '--bg-card': 'rgba(255, 255, 255, 0.65)',
                      '--bg-card-hover': 'rgba(255, 255, 255, 0.75)',
                      '--border-primary': 'rgba(148, 163, 184, 0.25)',
                      '--border-secondary': 'rgba(148, 163, 184, 0.15)',
                      '--border-accent': 'rgba(148, 163, 184, 0.35)'
                    }
                  }
                };
                
                var doc = document.documentElement;
                var acc = ACCENTS[mode] && ACCENTS[mode][accent];
                if (acc) {
                  doc.style.setProperty('--accent-blue', acc[0]);
                  doc.style.setProperty('--accent-blue-glow', acc[1]);
                  doc.style.setProperty('--gradient-primary', acc[2]);
                }
                
                var vib = VIBRANCY[mode] && VIBRANCY[mode][vibrancy];
                if (vib) {
                  for (var key in vib) {
                    if (vib.hasOwnProperty(key)) {
                      doc.style.setProperty(key, vib[key]);
                    }
                  }
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
