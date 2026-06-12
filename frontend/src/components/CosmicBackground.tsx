'use client';

import React, { useEffect, useRef } from 'react';

interface CosmicBackgroundProps {
  text?: string;
}

export default function CosmicBackground({ text = 'DATABRIDGE' }: CosmicBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;

    // Size canvas to parent — use Math.round to avoid fractional pixel misalignment
    const syncSize = () => {
      const rect = parent.getBoundingClientRect();
      width = Math.round(rect.width);
      height = Math.round(rect.height);
      canvas.width = width;
      canvas.height = height;
    };
    syncSize();

    // Mouse state
    const mouse = { x: null as number | null, y: null as number | null, radius: 130, active: false };

    // Color palettes
    const palettes = {
      dark: ['#6366f1', '#a855f7', '#06b6d4', '#ec4899', '#3b82f6', '#818cf8'],
      light: ['#4f46e5', '#059669', '#0891b2', '#9333ea', '#3b82f6', '#6366f1'],
    };

    let currentTheme: 'dark' | 'light' = 'dark';
    const updateTheme = () => {
      const attr = document.documentElement.getAttribute('data-theme');
      currentTheme = attr === 'light' ? 'light' : 'dark';
    };
    updateTheme();

    const themeObserver = new MutationObserver(() => { updateTheme(); recolorParticles(); });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const getColors = () => palettes[currentTheme];

    // ─── Text Particle ──────────────────────────────────────────
    class TextParticle {
      x: number; y: number;
      baseX: number; baseY: number;
      vx = 0; vy = 0;
      size: number; color: string;
      speedFactor: number; friction = 0.88;
      opacity = 0; markedForDeletion = false;

      constructor(x: number, y: number, color: string) {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.baseX = x;
        this.baseY = y;
        this.size = Math.random() * 2 + 1.5;
        this.color = color;
        this.speedFactor = Math.random() * 0.08 + 0.04;
      }

      draw() {
        if (!ctx) return;
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.opacity;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }

      update() {
        if (this.opacity < 0.9 && !this.markedForDeletion) this.opacity += 0.025;

        const tx = this.markedForDeletion ? this.x : this.baseX;
        const ty = this.markedForDeletion ? this.y : this.baseY;
        this.vx += (tx - this.x) * this.speedFactor;
        this.vy += (ty - this.y) * this.speedFactor;
        this.vx *= this.friction;
        this.vy *= this.friction;

        // Mouse repulsion
        if (mouse.x !== null && mouse.y !== null && mouse.active) {
          const dx = mouse.x - this.x;
          const dy = mouse.y - this.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < mouse.radius) {
            const force = (mouse.radius - dist) / mouse.radius;
            const angle = Math.atan2(dy, dx);
            this.vx -= Math.cos(angle) * force * 14;
            this.vy -= Math.sin(angle) * force * 14;
          }
        }

        this.x += this.vx;
        this.y += this.vy;

        if (this.markedForDeletion) {
          this.opacity -= 0.05;
          this.size = Math.max(0, this.size - 0.1);
        }
      }
    }

    // ─── Star Particle ──────────────────────────────────────────
    class StarParticle {
      x: number; y: number;
      vx: number; vy: number;
      size: number;
      baseOpacity: number; opacity: number;

      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * 0.35;
        this.vy = (Math.random() - 0.5) * 0.35;
        this.size = Math.random() * 1.5 + 0.5;
        this.baseOpacity = Math.random() * 0.5 + 0.15;
        this.opacity = this.baseOpacity;
      }

      draw() {
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = this.opacity;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 0) this.x = width;
        if (this.x > width) this.x = 0;
        if (this.y < 0) this.y = height;
        if (this.y > height) this.y = 0;
        this.opacity = this.baseOpacity + Math.sin(Date.now() * 0.001 * this.size) * 0.12;
      }
    }

    let textParticles: TextParticle[] = [];
    let starParticles: StarParticle[] = [];

    // Extract text pixel coordinates via offscreen canvas
    const getTextCoordinates = (msg: string): { x: number; y: number }[] => {
      if (width < 10 || height < 10) return [];

      const tc = document.createElement('canvas');
      const tctx = tc.getContext('2d');
      if (!tctx) return [];

      // Use integer dimensions matching main canvas
      tc.width = width;
      tc.height = height;

      const isSplit = width > 900;
      const displayWidth = isSplit ? width * 0.55 : width;
      const fontSize = Math.min(64, Math.max(24, Math.round(displayWidth * 0.08)));
      // Use bold + sans-serif (guaranteed available) to avoid font-loading issues
      tctx.font = `bold ${fontSize}px sans-serif`;
      tctx.fillStyle = '#ffffff';
      tctx.textAlign = 'center';
      tctx.textBaseline = 'middle';

      const textCenterX = isSplit ? Math.round(width * 0.275) : Math.round(width / 2);
      tctx.fillText(msg, textCenterX, Math.round(height / 2));

      const imageData = tctx.getImageData(0, 0, width, height);
      const pixels = imageData.data;
      const coords: { x: number; y: number }[] = [];
      const step = 4;

      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const idx = (y * width + x) * 4 + 3; // alpha channel
          if (idx < pixels.length && pixels[idx] > 128) {
            coords.push({ x, y });
          }
        }
      }
      return coords;
    };

    const initTextParticles = (msg: string) => {
      const coords = getTextCoordinates(msg);
      const colors = getColors();
      if (coords.length === 0) {
        textParticles.forEach(p => (p.markedForDeletion = true));
        return;
      }

      const shuffled = [...coords].sort(() => Math.random() - 0.5);
      const existing = textParticles.filter(p => !p.markedForDeletion);
      let ci = 0;

      existing.forEach(p => {
        if (ci < shuffled.length) {
          p.baseX = shuffled[ci].x;
          p.baseY = shuffled[ci].y;
          p.color = colors[Math.floor(Math.random() * colors.length)];
          ci++;
        } else {
          p.markedForDeletion = true;
        }
      });

      for (let i = ci; i < shuffled.length; i++) {
        textParticles.push(new TextParticle(shuffled[i].x, shuffled[i].y, colors[Math.floor(Math.random() * colors.length)]));
      }
    };

    const recolorParticles = () => {
      const colors = getColors();
      textParticles.forEach(p => { p.color = colors[Math.floor(Math.random() * colors.length)]; });
    };

    const initStars = () => {
      starParticles = [];
      const count = Math.min(80, Math.floor((width * height) / 15000));
      for (let i = 0; i < count; i++) starParticles.push(new StarParticle());
    };

    const drawConnections = () => {
      if (!ctx) return;
      const maxDist = 90;
      ctx.lineWidth = 0.4;
      for (let i = 0; i < starParticles.length; i++) {
        for (let j = i + 1; j < starParticles.length; j++) {
          const dx = starParticles[i].x - starParticles[j].x;
          const dy = starParticles[i].y - starParticles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.12;
            ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.moveTo(starParticles[i].x, starParticles[i].y);
            ctx.lineTo(starParticles[j].x, starParticles[j].y);
            ctx.stroke();
          }
        }
      }
    };

    // ─── Initialize after a frame to ensure layout is stable ────
    initStars();

    // Wait for fonts + next frame before scanning text pixels
    const initText = () => {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          requestAnimationFrame(() => {
            syncSize();
            initTextParticles(text);
          });
        });
      } else {
        // Fallback: just wait a frame
        requestAnimationFrame(() => {
          syncSize();
          initTextParticles(text);
        });
      }
    };
    initText();

    // ─── Mouse Events ───────────────────────────────────────────
    const toLocal = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const onMouseMove = (e: MouseEvent) => {
      const pos = toLocal(e.clientX, e.clientY);
      if (pos.x >= 0 && pos.x <= width && pos.y >= 0 && pos.y <= height) {
        mouse.x = pos.x;
        mouse.y = pos.y;
        mouse.active = true;
      } else {
        mouse.active = false;
      }
    };

    const onMouseLeave = () => {
      mouse.active = false;
      mouse.x = null;
      mouse.y = null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const pos = toLocal(e.touches[0].clientX, e.touches[0].clientY);
        mouse.x = pos.x;
        mouse.y = pos.y;
        mouse.active = true;
      }
    };

    const onTouchEnd = () => {
      mouse.active = false;
      mouse.x = null;
      mouse.y = null;
    };

    const onClick = (e: MouseEvent) => {
      const pos = toLocal(e.clientX, e.clientY);
      if (pos.x < 0 || pos.x > width || pos.y < 0 || pos.y > height) return;
      // If split view, clicking on the right form side should not cause particle explosion
      if (width > 900 && pos.x > width * 0.55) return;
      textParticles.forEach(p => {
        const dx = p.x - pos.x;
        const dy = p.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 180) {
          const angle = Math.atan2(dy, dx);
          const force = (180 - dist) / 8;
          p.vx += Math.cos(angle) * force;
          p.vy += Math.sin(angle) * force;
        }
      });
    };

    // Attach to window for global mouse tracking, canvas for touch/click
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('click', onClick);
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd);

    // Resize via ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      syncSize();
      initTextParticles(text);
      initStars();
    });
    resizeObserver.observe(parent);

    // ─── Render Loop ────────────────────────────────────────────
    const render = () => {
      ctx.clearRect(0, 0, width, height);
      drawConnections();
      starParticles.forEach(s => { s.update(); s.draw(); });
      textParticles = textParticles.filter(p => !p.markedForDeletion || p.opacity > 0.01);
      textParticles.forEach(p => { p.update(); p.draw(); });
      ctx.globalAlpha = 1; // reset for next frame
      animationFrameId = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      themeObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('click', onClick);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, [text]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 1,
        pointerEvents: 'auto',
      }}
    />
  );
}
