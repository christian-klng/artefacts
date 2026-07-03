"use client";

import { useEffect, useRef } from "react";

// Celebration palette: the semantic tokens (DESIGN.md §4). Decorative use is
// fine here — a transient one-off celebration overlay, not persistent UI colour.
const COLORS = ["#ef476f", "#ffd166", "#06d6a0", "#118ab2", "#073b4c"];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  wobble: number;
  color: string;
  life: number;
  ttl: number;
};

function spawnBurst(
  particles: Particle[],
  originX: number,
  originY: number,
  angle: number,
  spread: number,
  count: number,
) {
  for (let i = 0; i < count; i += 1) {
    const a = angle + (Math.random() - 0.5) * spread;
    const speed = 13 + Math.random() * 15;
    particles.push({
      x: originX,
      y: originY,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 4,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.4,
      wobble: Math.random() * Math.PI * 2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      life: 0,
      ttl: 150 + Math.random() * 90, // in 60fps-normalized frames (~2.5–4s)
    });
  }
}

/**
 * One-shot full-viewport confetti (first publish!). Renders a fixed canvas
 * above everything, runs a single physics burst from both bottom corners, and
 * calls `onDone` when every piece has settled — the parent then unmounts it.
 * Skipped entirely under `prefers-reduced-motion`.
 */
export function ConfettiBurst({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Keep the latest callback without re-running the animation effect (the
  // parent passes a fresh closure each render).
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (
      !canvas ||
      !ctx ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      onDoneRef.current();
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    const particles: Particle[] = [];
    const W = window.innerWidth;
    const H = window.innerHeight;
    // Two cannons firing up and inward from the bottom corners.
    spawnBurst(particles, 0, H, -Math.PI / 3, Math.PI / 5, 110);
    spawnBurst(particles, W, H, -Math.PI + Math.PI / 3, Math.PI / 5, 110);

    let raf = 0;
    let last = performance.now();
    const started = last;

    const frame = (now: number) => {
      // Normalize to 60fps steps so speed is framerate-independent.
      const dt = Math.min((now - last) / 16.667, 3);
      last = now;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      let alive = 0;
      for (const p of particles) {
        p.life += dt;
        if (p.life >= p.ttl || p.y > window.innerHeight + 40) continue;
        alive += 1;

        p.vy += 0.32 * dt; // gravity
        p.vx *= 0.985 ** dt; // air drag
        p.vy *= 0.985 ** dt;
        p.wobble += 0.12 * dt;
        p.rot += p.vr * dt;
        p.x += p.vx * dt + Math.sin(p.wobble) * 0.6;
        p.y += p.vy * dt;

        // Fade out over the last quarter of a piece's life.
        const fade = (p.ttl - p.life) / (p.ttl * 0.25);
        ctx.globalAlpha = Math.max(0, Math.min(1, fade));
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        // Squash the height with the wobble to fake a tumbling 3D flutter.
        const h = p.h * (0.55 + 0.45 * Math.sin(p.wobble * 2));
        ctx.fillRect(-p.w / 2, -h / 2, p.w, h);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      ctx.globalAlpha = 1;

      // Hard cap as a safety net against a stalled tab clock.
      if (alive === 0 || now - started > 6000) {
        onDoneRef.current();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[100] h-full w-full"
      aria-hidden
    />
  );
}
