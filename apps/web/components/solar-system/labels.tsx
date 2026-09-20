import { useEffect } from "react";
import * as THREE from "three";
import { BODY_BY_ID, type BodyId } from "../../lib/solar-system/bodies";
import { runtime } from "../../lib/solar-system/runtime";
import { useSolar } from "../../lib/solar-system/store";
import { solarBodyCopy, type SolarSystemLocale } from "../../lib/solar-system-i18n";

const LABEL_IDS: BodyId[] = [
  "sun", "mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune",
];

const _v = new THREE.Vector3();

export function PlanetLabels({ locale }: { locale: SolarSystemLocale }) {
  const show = useSolar((s) => s.showLabels);
  const selected = useSolar((s) => s.selectedId);
  const hovered = useSolar((s) => s.hoveredId);
  const bodyCopy = solarBodyCopy[locale];

  useEffect(() => {
    if (!show) return;
    let raf = 0;
    const loop = () => {
      const camera = runtime.camera;
      if (camera) {
        camera.updateMatrixWorld();
        const placed: { x: number; y: number }[] = [];
        for (const id of LABEL_IDS) {
          const el = document.getElementById(`solar-label-${id}`);
          const p = runtime.positions[id];
          if (!el || !p) continue;
          _v.set(p.x, p.y, p.z).project(camera);
          const onScreen = _v.z < 1 && _v.x > -1.15 && _v.x < 1.15 && _v.y > -1.15 && _v.y < 1.15;
          const x = (_v.x * 0.5 + 0.5) * runtime.size.w;
          const y = (-_v.y * 0.5 + 0.5) * runtime.size.h;
          let crowded = false;
          for (const q of placed) {
            if (Math.hypot(x - q.x, y - q.y) < 34) crowded = true;
          }
          const hot = id === selected || id === hovered;
          el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -145%)`;
          el.style.opacity = !onScreen || (crowded && !hot) ? "0" : hot ? "1" : "0.8";
          el.dataset.active = hot ? "true" : "false";
          if (!crowded && onScreen) placed.push({ x, y });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [show, selected, hovered]);

  if (!show) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {LABEL_IDS.map((id) => (
        <div
          key={id}
          id={`solar-label-${id}`}
          data-active="false"
          className="absolute left-0 top-0 whitespace-nowrap rounded-full border border-white/10 bg-black/55 px-2 py-1 text-[10px] font-black uppercase tracking-[.12em] text-white opacity-0 shadow-lg backdrop-blur-md data-[active=true]:border-cyan-300/30 data-[active=true]:bg-cyan-400/10 data-[active=true]:text-cyan-100"
        >
          {bodyCopy[id].name}
        </div>
      ))}
    </div>
  );
}
