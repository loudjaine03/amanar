import { useEffect, useRef } from 'react';
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    const stars = Array.from({ length: 85 }, (): [number, number, number] => [Math.random(), Math.random(), Math.random()]);
    const color = getComputedStyle(canvas).color;
    function draw(time: number) {
      if (!canvas || !ctx) return;
      canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = color;
      for (const [x, y, seed] of stars) { ctx.globalAlpha = .2 + .45 * (1 + Math.sin(time / 2500 + seed * 8)) / 2; ctx.fillRect(x * canvas.width, y * canvas.height, seed > .8 ? 2 : 1, seed > .8 ? 2 : 1); }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <canvas ref={ref} className="starfield" aria-hidden="true"/>;
}