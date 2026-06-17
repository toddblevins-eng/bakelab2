import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";

// ---------------------------------------------------------------------------
// BakeLab Production Gantt  ·  v5
// Recipe library (save / load / new) feeding two production slots,
// baker's-% with a balancing main flour, auto batch count, draggable schedule.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "bakelab-gantt-config-v8";
const PX = 1.7;   // pixels per minute
const SNAP = 5;   // drag snap, minutes
const NEW = "__new__";

const uid = () => Math.random().toString(36).slice(2, 9);
const mk = (name, pct) => ({ id: uid(), name, pct });

// deep-copy a recipe with fresh ingredient ids (so slots never share refs)
const cloneRecipe = (r) => ({
  name: r.name, loafWeight: r.loafWeight, shape: r.shape || "round", water: r.water, salt: r.salt, levain: r.levain,
  levHyd: r.levHyd ?? 80, levInoc: r.levInoc ?? 10, levRefInoc: r.levRefInoc ?? 10, levBuildHrs: r.levBuildHrs ?? 5, levRefTemp: r.levRefTemp ?? 24,
  levWhole: r.levWhole ?? 0, levExpNote: r.levExpNote || "",
  bakeTemp: r.bakeTemp ?? 245, bakeMin: r.bakeMin ?? 45, steamMin: r.steamMin ?? 20,
  autolyse: r.autolyse ?? 45,
  calNote: r.calNote || "",
  flours: r.flours.map((f) => mk(f.name, f.pct)),
  inclusions: r.inclusions.map((f) => mk(f.name, f.pct)),
});
const blankRecipe = () => ({ name: "New recipe", loafWeight: 850, shape: "round", flours: [mk("Bread flour", 100)], water: 75, salt: 2, levain: 20, levHyd: 80, levInoc: 10, levRefInoc: 10, levBuildHrs: 5, levRefTemp: 24, levWhole: 0, levExpNote: "", bakeTemp: 245, bakeMin: 45, steamMin: 20, autolyse: 45, calNote: "", inclusions: [] });

// date helpers — defined early because DEFAULT_SLOTS uses them at module-eval time
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const addDaysISO = (iso, n) => { try { const d = new Date((iso || todayISO()) + "T00:00:00"); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); } catch (e) { return todayISO(); } };
const dateDiffDays = (a, b) => { try { return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000); } catch (e) { return 0; } };
const sessionLoaves = (slot, si) => { const ss = slot.sessions || []; if (si === 0) return Math.max(0, (slot.loaves || 0) - ss.slice(1).reduce((a, s) => a + Math.max(0, +(s.loaves) || 0), 0)); return Math.max(0, +(ss[si] && ss[si].loaves) || 0); };
const remixName = (base, iso) => { const [y, m, d] = (iso || todayISO()).split("-"); return `${(base || "Recipe").replace(/\s+/g, "_")}_remix_${d}${m}${y.slice(2)}`; };
function HapLogo({ className }) {
  return (
    <svg className={className} viewBox="0 0 632.42 166.2" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="House au Pain" fill="currentColor">
      <path d="M31.74,77.5l14.15-7.67,17.59,32.46,8.42-4.57-17.59-32.46,14.15-7.67,42.61,78.61-14.15,7.67-18.2-33.58-8.42,4.57,18.2,33.58-14.15,7.67L31.74,77.5Z"/>
      <path d="M113.05,115.51l-20.33-49.79c-4.35-10.64.51-21.04,12.1-25.78,11.59-4.73,22.34-.71,26.69,9.94l20.33,49.79c4.39,10.76-.46,21.16-12.05,25.9-11.59,4.73-22.34.71-26.73-10.05ZM136.94,105.75l-20.28-49.67c-1.11-2.72-3.56-3.65-6.28-2.54-2.72,1.11-3.82,3.49-2.71,6.21l20.28,49.67c1.11,2.72,3.56,3.65,6.28,2.54,2.72-1.11,3.82-3.49,2.71-6.21Z"/>
      <path d="M163.17,95.75l-19.6-68.8,15.48-4.41,19.6,68.8c.81,2.83,3.14,4.02,5.84,3.25,2.83-.81,4.18-3.05,3.37-5.88l-19.6-68.8,15.48-4.41,19.6,68.8c3.19,11.18-2.79,20.98-14.83,24.42-12.04,3.43-22.16-1.79-25.35-12.97Z"/>
      <path d="M214.18,81.84l-2.24-13.09,15.87-2.72,2.24,13.09c.5,2.9,2.69,4.34,5.46,3.86,2.9-.5,4.48-2.58,3.99-5.48l-1.75-10.2c-1.79-10.45-27.1-7.67-30.58-27.94l-1.81-10.58c-1.96-11.46,4.8-20.39,17.02-22.48,12.21-2.09,21.69,4.06,23.65,15.52l2,11.71-15.86,2.72-2.03-11.84c-.45-2.64-2.52-4.1-5.29-3.63-2.64.45-4.13,2.39-3.65,5.16l1.51,8.81c1.81,10.58,27.1,7.67,30.58,27.94l2.07,12.09c1.96,11.46-5.03,20.56-17.37,22.67-12.34,2.11-21.84-4.17-23.8-15.62Z"/>
      <path d="M263.52,2.16l30.33-2.16,1.04,14.65-14.27,1.02,1.58,22.17,12.87-.92,1.02,14.27-12.87.92,1.67,23.45,14.27-1.02,1.04,14.65-30.33,2.16-6.35-89.2Z"/>
      <path d="M329.94,17.05l15,.52,4.63,54.33-10.28-.35-.63-13.1-5.8-.2-1.53,13.03-9.82-.34,8.43-53.88ZM333.83,50.23l4.48.15-.97-18.92.15-4.48-1.32-.04-.15,4.48-2.19,18.81Z"/>
      <path d="M358.62,61.72l4.5-43.07,9.69,1.01-4.5,43.07c-.19,1.77.86,2.97,2.55,3.14,1.77.18,3.03-.77,3.22-2.54l4.5-43.08,9.69,1.01-4.5,43.07c-.73,7-6.3,11.16-13.83,10.38-7.54-.79-12.05-6-11.32-13Z"/>
      <path d="M415.29,7.65l21.38,4.49c11.75,2.47,17.98,11.34,15.73,22.1l-4.33,20.63c-2.26,10.75-11.53,16.38-23.28,13.91l-5.62-1.18-6.48,30.88-15.75-3.31,18.37-87.52ZM428.03,25.33l-5.85,27.88,4.63.97c2.88.6,5.12-.75,5.72-3.63l3.91-18.63c.6-2.88-.9-5.02-3.78-5.62l-4.62-.97Z"/>
      <path d="M478.16,22.55l23.61,7.54-16.98,88.44-16.18-5.17,4.86-21.11-9.12-2.91-8.27,20.02-15.45-4.93,37.54-81.88ZM469.48,77.03l7.06,2.25,6.92-30.51,2.25-7.06-2.07-.66-2.25,7.06-11.91,28.91Z"/>
      <path d="M528.46,40.11l14.85,6.21-34.51,82.49-14.85-6.21,34.51-82.49Z"/>
      <path d="M562.82,54.82l16.35,8.71-11.82,41.75-4.16,10.52,1.92,1.02,4.04-10.58,19.94-37.43,14.21,7.57-42.03,78.92-16.24-8.65,11.82-41.75,4.04-10.58-1.92-1.02-4.04,10.58-19.94,37.43-14.21-7.57,42.04-78.92Z"/>
      <path d="M8.59,127.07l1.28,8.45,2.2,3.03-2.23,1.62-2.2-3.03-7.63-3.84,2.53-1.84,4.57,2.55-1.02-5.12,2.51-1.82Z"/>
      <path d="M18.44,120.23l1.09,8.47,2.13,3.08-2.27,1.57-2.13-3.08-7.55-4.01,2.58-1.78,4.51,2.65-.91-5.14,2.55-1.76Z"/>
      <path d="M21.06,121.66c-.08-1,.11-1.94.56-2.83.45-.89,1.14-1.63,2.05-2.24,1.12-.74,2.28-1.08,3.47-1.02,1.19.06,2.26.52,3.21,1.37l-2.53,1.67c-.45-.27-.92-.4-1.4-.37-.48.02-.94.18-1.38.47-.71.47-1.12,1.1-1.23,1.88-.11.79.1,1.59.65,2.42.55.83,1.2,1.34,1.97,1.54.77.2,1.5.07,2.21-.4.44-.29.77-.65.97-1.09.21-.44.28-.91.21-1.43l2.53-1.67c.41,1.2.4,2.36,0,3.48-.41,1.12-1.18,2.05-2.3,2.79-.92.61-1.87.94-2.86,1.01s-1.93-.13-2.82-.59c-.88-.46-1.64-1.16-2.25-2.09-.62-.93-.96-1.9-1.04-2.9Z"/>
      <path d="M12.38,149.41l6.86,9.03-2.2,1.67-4.11-5.41,2.09,6.95-1.78,1.35-6.15-3.88,4.12,5.43-2.2,1.67-6.86-9.03,2.6-1.97,7.28,4.33-2.24-8.15,2.58-1.96Z"/>
      <path d="M25.59,151.39l-3.44,2.47.62,2.02-2.35,1.69-3.28-11.6,2.6-1.86,9.94,6.82-2.38,1.7-1.72-1.23ZM23.77,150.08l-3.56-2.55,1.29,4.18,2.27-1.63Z"/>
      <path d="M30.76,137.32c1-.11,1.95.05,2.84.48.89.43,1.65,1.11,2.28,2.03.62.92.98,1.87,1.06,2.85.08.99-.12,1.93-.59,2.83-.47.9-1.2,1.68-2.18,2.35l-3.51,2.4-6.4-9.36,3.51-2.4c.99-.67,1.98-1.07,2.99-1.18ZM34.2,143.9c.16-.8-.06-1.63-.65-2.49-.59-.86-1.29-1.37-2.1-1.52-.81-.15-1.64.07-2.51.66l-1.08.74,3.72,5.44,1.08-.74c.86-.59,1.37-1.28,1.53-2.08Z"/>
      <path d="M37.38,134.72l1.26,1.92,3.09-2.03,1.17,1.78-3.09,2.03,1.36,2.08,3.5-2.29,1.21,1.85-5.81,3.81-6.21-9.48,5.81-3.8,1.21,1.85-3.5,2.29Z"/>
      <path d="M610.56,117.55l-1.26,1.92,3.09,2.03-1.17,1.78-3.09-2.03-1.36,2.08,3.5,2.29-1.21,1.85-5.81-3.81,6.22-9.48,5.8,3.81-1.21,1.85-3.5-2.29Z"/>
      <path d="M612.5,129.45c-.39-.59-.6-1.22-.62-1.87-.03-.66.16-1.3.56-1.92l2.43,1.66c-.2.37-.26.72-.18,1.04.08.32.28.6.61.82.34.23.66.33.96.31.3-.02.55-.17.74-.45.16-.23.21-.47.16-.73-.05-.26-.16-.51-.32-.76-.16-.25-.41-.58-.74-.99-.48-.6-.84-1.12-1.1-1.57-.26-.45-.4-.95-.42-1.5s.16-1.12.56-1.71c.59-.87,1.38-1.34,2.34-1.4.97-.06,1.96.25,2.97.94,1.03.7,1.69,1.52,1.99,2.44s.16,1.84-.39,2.75l-2.47-1.68c.19-.31.24-.63.15-.94-.09-.31-.29-.58-.61-.8-.28-.19-.55-.27-.82-.24-.27.03-.5.18-.69.46-.21.3-.22.63-.06,1,.17.36.49.85.96,1.46.46.62.82,1.15,1.07,1.59s.39.94.42,1.48c.03.54-.14,1.1-.52,1.66-.37.53-.83.93-1.4,1.18-.57.25-1.2.33-1.89.23-.69-.09-1.39-.38-2.09-.86-.68-.47-1.22-1-1.61-1.59Z"/>
      <path d="M632.42,129.9l-1.28,1.8-2.45-1.74-5.29,7.44-2.25-1.6,5.29-7.44-2.45-1.74,1.28-1.8,7.15,5.08Z"/>
      <path d="M594.37,139.2c1.36-.15,2.45-.29,3.27-.42.82-.13,1.57-.34,2.26-.62.69-.28,1.19-.66,1.51-1.15.24-.37.35-.71.31-1.03-.04-.32-.22-.59-.56-.82-.34-.23-.69-.27-1.06-.15-.36.13-.7.43-1.01.89l-2.22-1.47c.52-.75,1.11-1.28,1.75-1.59.65-.31,1.3-.42,1.97-.32.67.09,1.31.34,1.93.75,1.07.71,1.69,1.51,1.88,2.42.18.91-.02,1.8-.6,2.68-.63.96-1.55,1.64-2.75,2.03-1.2.39-2.56.64-4.09.75l3.64,2.4-1.24,1.87-6.76-4.47,1.13-1.71c.47-.04.68-.06.64-.06Z"/>
      <path d="M608.38,139.15c1.2-.47,2.45-.25,3.76.66s1.96,2,1.94,3.29c-.02,1.28-.56,2.69-1.61,4.21-1.07,1.54-2.2,2.54-3.39,3.01-1.2.47-2.45.25-3.76-.66-1.31-.91-1.96-2-1.94-3.29.02-1.28.56-2.7,1.63-4.24,1.05-1.52,2.18-2.52,3.38-2.98ZM611.38,143.5c.14-.62-.1-1.14-.71-1.56-.61-.42-1.18-.46-1.71-.11-.53.35-1.1.97-1.72,1.86-.42.6-.73,1.12-.93,1.57-.2.44-.28.86-.23,1.25.05.39.29.74.71,1.03.42.29.83.4,1.21.3.39-.09.75-.31,1.09-.66.34-.35.72-.82,1.14-1.42.62-.89,1-1.65,1.14-2.27Z"/>
      <path d="M612.54,151.58c1.37-.09,2.46-.18,3.28-.28.82-.1,1.58-.27,2.28-.52.7-.25,1.22-.61,1.56-1.08.26-.36.38-.7.36-1.02-.02-.32-.2-.6-.53-.84-.33-.24-.68-.3-1.05-.19-.37.11-.72.4-1.04.85l-2.16-1.56c.55-.73,1.16-1.23,1.82-1.51s1.32-.36,1.99-.24c.66.12,1.29.4,1.9.83,1.04.75,1.63,1.58,1.77,2.5.14.91-.1,1.8-.72,2.65-.67.93-1.62,1.57-2.83,1.91-1.21.34-2.59.53-4.12.57l3.53,2.56-1.31,1.82-6.57-4.75,1.2-1.66c.47-.02.68-.03.64-.03Z"/>
      <path d="M626.03,151.76c1.21-.42,2.46-.15,3.73.82s1.87,2.08,1.8,3.37c-.07,1.28-.67,2.66-1.79,4.14-1.13,1.49-2.3,2.45-3.52,2.87-1.21.42-2.46.15-3.73-.82-1.27-.96-1.87-2.08-1.8-3.37s.67-2.67,1.8-4.16c1.12-1.48,2.28-2.42,3.5-2.84ZM628.83,156.22c.17-.61-.05-1.14-.64-1.59-.59-.45-1.16-.51-1.7-.19-.54.32-1.14.92-1.8,1.79-.44.58-.77,1.09-.99,1.53-.22.43-.32.85-.28,1.24.03.4.25.75.67,1.06.41.31.81.43,1.2.35.39-.08.76-.28,1.12-.61.36-.33.76-.79,1.2-1.37.66-.87,1.07-1.61,1.23-2.22Z"/>
      <path d="M188.76,152.31c-1.12-3.41.95-8.3.28-10.34-.23-.71-.7-1.09-1.46-.85-3.58,1.18-3.86,11.22-3.7,16.62l-4.47,1.47c.21-9.78.39-12.39-.14-13.98-.23-.71-.81-1.11-1.47-.89-3.58,1.18-3.78,10.71-3.66,16.6l-4.51,1.49c.07-6.5.1-12.98.17-19.47l4.42-1.46-.12,4.11c1.15-3.37,2.89-5.51,5.02-6.21,2.17-.71,4,.55,4.44,3.05.75-3.24,2.82-5.44,4.99-6.15,2.08-.68,4.08.33,4.76,2.4,1.14,3.16-.9,8.88-.28,10.78.19.58.66.81,1.23.62,1.77-.58,3.32-4.97,4.09-10.22l2.6,1.5c-.4,4.3-2.46,12.04-6.89,13.5-2.66.87-4.57-.31-5.31-2.57Z"/>
      <path d="M211.34,139c-.6,4.28-3.02,11.91-7.38,13.12-6.96,1.93-6.07-7.74-5.15-18.19l4.67-1.3c-.71,8.41-1.7,15.46.72,14.78,1.75-.49,3.63-4.68,4.61-10.03l2.53,1.62ZM198.52,128.88c-.59-2.11.63-4.52,2.56-5.06,1.35-.37,2.61.34,2.98,1.69.55,1.97-.66,4.58-2.54,5.11-1.48.41-2.62-.38-3-1.73Z"/>
      <path d="M227.94,135.07c-1.36,5.84-2.9,11.69-10.82,13.62-4.16,1.02-8.02-.83-9.15-5.49-1.49-6.11,1.58-12.61,6.83-13.89,4.75-1.16,7.61,2.89,7.19,7.45l-4.75,1.16c.27-2.85-.59-4.79-2.09-4.43-2.08.51-3.33,4.65-2.51,8,.62,2.53,2.28,3.66,4.55,3.11,4.39-1.07,6.54-4.04,8.19-11.25l2.58,1.72Z"/>
      <path d="M244.72,131.88c-.91,4.18-3.91,11.67-8.25,12.55-2.78.56-4.65-1.15-5.12-3.48-.57-2.83.25-6.04,1.26-10.19-.92.14-2.05.22-3.15.16-.97,4.85-2.55,8.74-4.36,12.05-1.7,3.1-3.95.7-2.44-1.98,2.47-4.45,3.19-10.29,3.43-15.43l4.15-.84c-.04.72-.1,1.4-.19,2.13,2.32-.04,6.15-.63,7.87-1.02-.97,4.14-2.47,10.81-2.04,12.91.15.73.61,1.11,1.25.98,1.73-.35,4.01-4.85,5.13-9.64l2.45,1.78Z"/>
      <path d="M241.07,136.62c-1.06-6.39,2.22-13.12,8.33-14.13,4.04-.67,6.71,2.34,7.28,5.74,1.01,6.11-1.95,13.02-8.2,14.06-3.91.65-6.77-1.81-7.41-5.67ZM251.96,129.39c-.3-1.79-1.24-2.96-2.67-2.72-2.48.41-4.15,5.17-3.6,8.53.34,2.07,1.39,2.98,2.72,2.76,2.39-.4,4.12-5.07,3.54-8.57Z"/>
      <path d="M259.06,130.53l.92-4.01,11.79-1.44-.92,4.01-11.79,1.44Z"/>
      <path d="M298.41,124.77c-.91,2.08-4.21,4.59-7.83,4.24-1.3,4.64-4.7,8.89-9.15,9.25-3.2.26-8.87-1.61-6.33-11.73,1.47-6.05,3.13-11.98,4.7-18.05l4.97-.4c-1.33,4.36-2.76,9.15-3.95,13.5,1.12-1.68,3.17-3.02,5.12-3.17,2.92-.24,4.92,1.89,5.21,5.46.04.46.03.89.02,1.35,1.98.26,3.88-.6,4.88-2.64l2.38,2.19ZM286.22,124.82c-.12-1.49-1.02-2.21-2.09-2.12-1.72.14-3.61,2.16-4.54,5.6-.94,3.91.13,5.6,1.8,5.46,2.65-.22,5.13-5.28,4.83-8.94Z"/>
      <path d="M317.72,124.34c-.95,1.99-4.32,4.35-7.88,3.92-1.18,4.61-4.58,8.51-9.47,8.69-3.96.14-6.48-2.65-6.62-6.56-.24-6.47,3.87-12.73,10.06-12.95,4.1-.15,6.36,3.17,6.49,6.62v.37c2.03.44,4.01-.33,5.15-2.38l2.27,2.29ZM305.47,124.6c-.07-1.82-.86-3.09-2.3-3.04-2.51.09-4.77,4.6-4.65,8,.08,2.09,1,3.13,2.35,3.08,2.42-.09,4.73-4.51,4.6-8.05Z"/>
      <path d="M337.64,126.18c-1.83,3.93-6.32,10.57-10.79,10.49-2-.03-3.52-1.45-3.57-3.83-1.38,2.07-3.51,3.72-6.11,3.67-4.94-.08-6.01-5.5.02-18.91l4.89.08c-4.49,9.99-5.4,14.4-2.98,14.44,2.61.04,4.35-3.94,8.15-14.36l4.94.08c-4.13,10.88-5.63,14.35-3.77,14.38,1.82.03,4.81-3.46,7.21-8.32l2.01,2.27Z"/>
      <path d="M347.94,126.76c-1.89,3.88-6.55,10.4-11.06,10.21-4.56-.19-5.01-3.85-2.11-11.84,1.68-4.5,4.59-11.37,7.19-17.69l4.93.21c-3.31,7.6-6.07,14.52-7.55,18.42-1.94,5-2.19,6.43-.79,6.49,1.81.08,4.9-3.33,7.48-8.12l1.91,2.32Z"/>
      <path d="M368.45,128.46c-2.07,3.81-6.96,10.16-11.42,9.81-2.23-.17-3.36-1.8-3.52-3.4-1.15,1.55-2.94,2.9-5.54,2.7-3.2-.25-5.04-3.06-4.72-7.14.48-6.22,5.3-12.25,10.54-11.84,1.86.14,3.58,1.45,4.18,2.75l.8-1.9,4.74.37c-4.95,10.83-6.41,13.98-4.65,14.12,1.81.14,4.96-3.16,7.71-7.85l1.87,2.39ZM356.6,124.6c-.54-.93-1.51-1.66-2.67-1.75-3.07-.24-5.44,3.92-5.72,7.5-.12,1.49.44,2.79,1.92,2.91,2.04.16,4.13-2.67,6.47-8.65Z"/>
      <path d="M372.43,135.83c.44-3.56,4.35-7.06,4.62-9.23.09-.74-.12-1.28-.95-1.39-3.7-.46-8.52,8.51-10.54,13.43l-4.81-.6c2.84-5.84,5.63-11.69,8.52-17.53l4.67.58-1.77,3.63c2.01-2.61,4.69-3.73,6.95-3.45,2.17.27,3.55,1.99,3.27,4.26-.33,3.43-4.65,7.59-4.9,9.58-.08.6.25,1.02.85,1.09,1.8.22,5.12-3.07,8.02-7.5l1.76,2.47c-2.25,3.71-7.37,9.83-11.99,9.25-2.77-.34-3.99-2.23-3.7-4.59Z"/>
      <path d="M408.25,134.85c-3.42,5.04-7.91,8.9-14.2,10.04l-.15.31c-3.46,6.4-8.39,8.68-12.7,7.94-3.4-.58-5.53-2.74-5.04-5.64.89-5.19,8.03-6.61,14.85-5.82l1.92-3.45c-1.34,1.19-3.29,1.56-4.9,1.29-3.08-.53-5.02-3.22-4.43-6.71.95-5.56,5.74-10.03,10.65-9.19,2.25.39,3.79,1.6,4.5,2.95l.83-1.56,4.68.8-7.99,14.89c3.8-1.24,6.86-3.6,10.28-8.4l1.69,2.56ZM389.33,144.84c-3.54-.32-8.17.54-8.57,2.83-.17.96.4,1.53,1.59,1.74,2.2.38,4.84-1.2,6.98-4.57ZM397.01,129.57c-.44-.74-1.65-1.7-2.89-1.91-3.21-.55-5.24,2.46-5.71,5.17-.3,1.74.45,2.91,1.96,3.17,2.75.47,4.86-3.23,6.63-6.42Z"/>
      <path d="M425.46,138.86c-3.78,4.66-7.72,9.24-15.69,7.51-4.51-.98-7.46-4.29-6.43-9.02,1.29-5.96,6.53-10.78,12.45-9.5,3.6.78,4.93,3.83,4.34,6.57-1.17,5.42-7.8,6.51-12.17,4.46-.08,1.89,1.01,3.27,3.65,3.84,4.42.96,7.6-.78,12.24-6.54l1.61,2.68ZM408.68,136.03c2.84.95,6.55.13,7.14-2.36.27-1.04-.16-1.89-1.16-2.11-2.28-.49-4.72,1.55-5.97,4.47Z"/>
      <path d="M441.91,143.35c-2.65,3.36-8.63,8.78-12.91,7.67-2.75-.71-3.68-3.07-3.08-5.37.72-2.79,2.87-5.32,5.6-8.6-.89-.28-1.94-.69-2.9-1.23-2.99,3.94-6.13,6.74-9.2,8.93-2.89,2.04-3.85-1.1-1.33-2.85,4.17-2.91,7.38-7.86,9.85-12.36l4.1,1.06c-.36.63-.7,1.21-1.1,1.83,2.1.98,5.8,2.13,7.53,2.53-2.68,3.3-6.96,8.64-7.49,10.71-.19.72.06,1.27.69,1.43,1.71.44,5.73-2.61,8.83-6.42l1.42,2.68Z"/>
      <path d="M451.98,146.53c-2.77,3.31-8.86,8.52-13.19,7.25-6.93-2.03-1.06-9.78,5.23-18.17l4.65,1.36c-5.04,6.77-9.61,12.23-7.19,12.94,1.74.51,5.55-2.06,9.21-6.08l1.29,2.71ZM446.43,131.17c.62-2.1,2.92-3.51,4.84-2.95,1.34.39,2.04,1.66,1.64,3.01-.58,1.97-2.98,3.54-4.86,2.99-1.47-.43-2.02-1.71-1.63-3.05Z"/>
      <path d="M463.43,156.78c-2.83,1.62-7.06,2.54-11.13,1.21-4.38-1.43-6.98-5.03-5.47-9.63,1.9-5.8,7.61-10.06,13.36-8.17,3.5,1.15,4.52,4.32,3.65,6.98-1.7,5.18-8.42,5.67-12.56,3.19-.27,1.87.67,3.35,3.23,4.2,2.52.83,6.02-.43,8.08-1.47l.84,3.71ZM452.29,147.54c2.72,1.28,6.51.76,7.33-1.57.38-1,.03-1.9-.94-2.22-2.21-.73-4.86,1.06-6.39,3.79Z"/>
    </svg>
  );
}
function DoughTempCalc({ tempUnit, uToC, cToU, initial, current, onApply, onClose }) {
  const seed = tempUnit === "F"
    ? { ddt: 75, lev: 75, flour: 71, room: 75, fric: 2 }
    : { ddt: 24, lev: 24, flour: 22, room: 24, fric: 1 };
  const r1 = (x) => Math.round(x * 10) / 10;
  const start = initial ? {
    ddt: r1(cToU(initial.ddtC)), lev: r1(cToU(initial.levC)), flour: r1(cToU(initial.flourC)),
    room: r1(cToU(initial.roomC)), fric: r1(tempUnit === "F" ? initial.fricC * 9 / 5 : initial.fricC),
  } : seed;
  const [ddt, setDdt] = useState(start.ddt);
  const [lev, setLev] = useState(start.lev);
  const [flour, setFlour] = useState(start.flour);
  const [room, setRoom] = useState(start.room);
  const [fric, setFric] = useState(start.fric);
  const n = (x) => (x === "" || x == null || isNaN(+x) ? 0 : +x);
  const water = n(ddt) * 4 - (n(lev) + n(flour) + n(room) + n(fric));
  const u = "°" + tempUnit;
  const apply = () => {
    const inputsC = {
      ddtC: uToC(n(ddt)), levC: uToC(n(lev)), flourC: uToC(n(flour)), roomC: uToC(n(room)),
      fricC: tempUnit === "F" ? n(fric) * 5 / 9 : n(fric),
    };
    onApply(uToC(water), inputsC); onClose();
  };
  const Field = (label, val, set, hint) => (
    <label className="dtc-field">
      <span className="dtc-lbl">{label}</span>
      <div className="dtc-inwrap"><input type="number" value={val} onChange={(e) => set(e.target.value)} /><em>{u}</em></div>
      {hint ? <small className="dtc-hint">{hint}</small> : null}
    </label>
  );
  return (
    <div className="bl-modal-overlay" onClick={onClose}>
      <div className="bl-modal dtc" onClick={(e) => e.stopPropagation()}>
        <div className="dtc-head">
          <div><h3>Dough temperature</h3><p>Measured day-of — solves the water temp to hit your target.</p></div>
          <button className="dtc-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="dtc-grid">
          {Field("Desired dough temp", ddt, setDdt)}
          {Field("Levain temp", lev, setLev)}
          {Field("Flour temp", flour, setFlour)}
          {Field("Room temp", room, setRoom)}
          {Field("Friction factor", fric, setFric, "Heat added by mixing — 0 if you mix quickly")}
        </div>
        <div className="dtc-result">
          <span className="dtc-rlabel">Mix water temperature</span>
          <span className="dtc-rval">{Math.round(water * 10) / 10}{u}</span>
          <span className="dtc-rformula">(desired × 4) − (levain + flour + room + friction)</span>
        </div>
        <button className="dtc-apply" onClick={apply}>{current != null ? "Update mix cards" : "Add to mix cards"} →</button>
      </div>
    </div>
  );
}

function IngAddRow({ onAdd }) {
  const [v, setV] = useState("");
  const [kind, setKind] = useState("flour");
  const add = () => { const n = v.trim(); if (n) { onAdd(n, kind); setV(""); } };
  return (
    <div className="bl-ing-add">
      <div className="bl-ing-kindtoggle">
        <button className={kind === "flour" ? "on" : ""} onClick={() => setKind("flour")}>Flour</button>
        <button className={kind === "inclusion" ? "on" : ""} onClick={() => setKind("inclusion")}>Inclusion</button>
      </div>
      <input className="bl-ing-input" value={v} placeholder={"Add " + (kind === "inclusion" ? "inclusion" : "flour") + "…"} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
      <button className="bl-newday" style={{ fontSize: 13, padding: "8px 14px" }} onClick={add}>Add</button>
    </div>
  );
}

const DEFAULT_LIBRARY = [
  { id: uid(), name: "Country", loafWeight: 850, shape: "round", flours: [mk("Bread flour", 90), mk("Whole wheat", 10)], water: 75, salt: 2, levain: 20, levHyd: 80, levInoc: 10, levRefInoc: 10, levBuildHrs: 5, levRefTemp: 24, levWhole: 0, levExpNote: "", bakeTemp: 245, bakeMin: 45, steamMin: 20, autolyse: 45, inclusions: [] },
  { id: uid(), name: "Seeded", loafWeight: 850, shape: "oval", flours: [mk("Bread flour", 80), mk("Whole wheat", 15), mk("Rye", 5)], water: 78, salt: 2.2, levain: 20, levHyd: 80, levInoc: 10, levRefInoc: 10, levBuildHrs: 4.5, levRefTemp: 24, levWhole: 5, levExpNote: "5% rye pre-ferment — testing for flavour depth", bakeTemp: 235, bakeMin: 42, steamMin: 18, autolyse: 60, inclusions: [mk("Mixed seeds", 12)] },
];
const DEFAULT_SLOTS = [
  { loaves: 50, mixOrder: 1, bakeOrder: 1, coreRecipeId: DEFAULT_LIBRARY[0].id, sessions: [{ id: uid(), date: addDaysISO(todayISO(), 1), loaves: 0 }], draft: cloneRecipe(DEFAULT_LIBRARY[0]) },
  { loaves: 50, mixOrder: 2, bakeOrder: 2, coreRecipeId: DEFAULT_LIBRARY[1].id, sessions: [{ id: uid(), date: addDaysISO(todayISO(), 1), loaves: 0 }], draft: cloneRecipe(DEFAULT_LIBRARY[1]) },
];

const DEFAULTS = { autolyse: 45, mix: 15, folds: 3, fold: 5, restBetween: 50, bulkRest: 40, preShape: 10, benchRest: 25, shape: 15, ovenCap: 2, preheatMin: 45, recoverMin: 7, bakeStart: "08:00" };
const GLOBALS_KEY = "bakelab-globals";

// ---- starter profile: named culture with maintenance protocol + fermentation calibration ----
const DEFAULT_STARTER = {
  name: "Thelma", est: "2020", notes: "After my late grandmother.",
  mFlour: [ { id: uid(), name: "Bread flour", pct: 80 }, { id: uid(), name: "Whole wheat", pct: 10 }, { id: uid(), name: "Rye", pct: 10 } ],
  mSeed: 50, mFlourRatio: 10, mHyd: 80, mWaterTemp: 33, mFridgeAt: 80, mIntervalDays: 7, mStorage: "fridge",
  lastFed: todayISO(),
  refTemp: 24, refInoc: 10, refHyd: 80, refBuildHrs: 5,
  q10: 2, hydDoubleHrs: 1.2, wholeAccelHrs: 1.5,
  hydCal: [ { hyd: 80, hrs: 5 }, { hyd: 100, hrs: 4.2 } ],
  wholeCal: [ { whole: 0, hrs: 5 }, { whole: 25, hrs: 3.5 } ],
};
const DAYS_KEY = "bakelab-days-v1";
// Avery 6468 — 2" × 4" ID labels, 10 per sheet (US Letter, portrait). Exact published geometry.
const AVERY_6468 = { pageW: 8.5, pageH: 11, cols: 2, rows: 5, labelW: 4, labelH: 2, top: 0.5, left: 0.15625, hGut: 0.1875, vGut: 0 };
const normalizeSlots = (sl) => (Array.isArray(sl) && sl.length && sl.every((s) => s && s.draft && Array.isArray(s.draft.flours)))
  ? sl.map((s, i) => ({ ...s, mixOrder: s.mixOrder ?? i + 1, bakeOrder: s.bakeOrder ?? i + 1, coreRecipeId: s.coreRecipeId || null, sessions: Array.isArray(s.sessions) && s.sessions.length ? s.sessions.map((sess) => ({ id: sess.id || uid(), date: sess.date || todayISO(), loaves: +(sess.loaves) || 0 })) : [{ id: uid(), date: addDaysISO(todayISO(), 1), loaves: 0 }] }))
  : DEFAULT_SLOTS.map((s) => ({ ...s, draft: cloneRecipe(s.draft) }));
const nowHM = () => { const d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
const newTempReading = () => ({ id: uid(), temp: null, date: "", time: "" });
const newSaniReading = () => ({ id: uid(), ppm: null, date: "", time: "" });
const newFridge = (n) => ({ id: uid(), name: n, readings: [newTempReading(), newTempReading(), newTempReading()] });
const newSaniStation = (n) => ({ id: uid(), name: n, kind: "Chlorine", min: 100, max: 200, readings: [newSaniReading(), newSaniReading(), newSaniReading()] });
const defaultFoodSafety = () => ({
  fridges: [ newFridge("Fridge 1") ],
  sanitizers: [ newSaniStation("Dishwasher"), newSaniStation("Sani Spray #1"), newSaniStation("Sani Spray #2") ],
});
const padTo3 = (arr, mk) => { const a = Array.isArray(arr) ? arr.slice(0, 3) : []; while (a.length < 3) a.push(mk()); return a; };
const normalizeFoodSafety = (fs) => {
  if (!fs || !Array.isArray(fs.fridges)) return defaultFoodSafety();
  return {
    fridges: fs.fridges.map((f) => ({ id: f.id || uid(), name: f.name || "Fridge", readings: padTo3(f.readings, newTempReading).map((r) => ({ id: r.id || uid(), temp: r.temp ?? null, date: r.date || "", time: r.time || "" })) })),
    sanitizers: (Array.isArray(fs.sanitizers) ? fs.sanitizers : []).map((s) => ({
      id: s.id || uid(), name: s.name || "Station", kind: "Chlorine", min: 100, max: 200,
      readings: Array.isArray(s.readings)
        ? padTo3(s.readings, newSaniReading).map((r) => ({ id: r.id || uid(), ppm: r.ppm ?? null, date: r.date || "", time: r.time || "" }))
        : padTo3([{ id: uid(), ppm: s.ppm ?? null, date: s.date || "", time: s.time || "" }], newSaniReading),
    })),
  };
};
const defaultDay = () => ({ params: DEFAULTS, slots: DEFAULT_SLOTS.map((s) => ({ ...s, draft: cloneRecipe(s.draft) })), maxBatch: 19000, ambientTemp: 21, starterTemp: 21, feedMode: "auto", feedTime: "21:00", stagger: 45, offsets: [0, 45, 90, 135], startTime: "07:00", bakeDateTimes: {}, retard: {}, foodSafety: defaultFoodSafety(), mixWaterTemp: null, calcInputs: null });
const newDayEntry = (name, day) => ({ id: uid(), name: name || "New bake day", date: todayISO(), updatedAt: Date.now(), day: day || defaultDay() });

// Buffered text field: keeps a local value so the cursor/focus survives the
// big parent re-render that each keystroke triggers; still commits upward live.
function BufferedInput({ value, onCommit, className, placeholder, rows }) {
  const [v, setV] = useState(value == null ? "" : value);
  const last = useRef(value == null ? "" : value);
  useEffect(() => { const nv = value == null ? "" : value; if (nv !== last.current) { last.current = nv; setV(nv); } }, [value]);
  const handle = (e) => { const nv = e.target.value; last.current = nv; setV(nv); onCommit(nv); };
  return rows
    ? <textarea className={className} rows={rows} placeholder={placeholder} value={v} onChange={handle} />
    : <input className={className} placeholder={placeholder} value={v} onChange={handle} />;
}

// IngredientInput: clears on focus for typing; dropdown arrow shows saved ingredients
function IngredientInput({ value, onCommit, className, placeholder, ingredients, kind = "flour" }) {
  const [v, setV] = useState(value == null ? "" : value);
  const [open, setOpen] = useState(false);
  const [browse, setBrowse] = useState(false);
  const last = useRef(value == null ? "" : value);
  const wrapRef = useRef(null);
  useEffect(() => { const nv = value == null ? "" : value; if (nv !== last.current) { last.current = nv; setV(nv); } }, [value]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const commit = (nv) => { last.current = nv; setV(nv); onCommit(nv); setOpen(false); };
  const pool = (ingredients || []).filter((i) => i.name && (i.kind || "flour") === kind);
  const filtered = (browse || !v) ? pool : pool.filter((i) => i.name.toLowerCase().includes(v.toLowerCase()));
  return (
    <div className="bl-ingwrap" ref={wrapRef}>
      <input className={className} value={v} placeholder={placeholder}
        onFocus={() => { setV(""); setBrowse(true); }}
        onBlur={() => { setTimeout(() => { if (document.activeElement !== wrapRef.current) setOpen(false); }, 150); if (!v.trim()) { setV(last.current); } }}
        onChange={(e) => { setV(e.target.value); setBrowse(false); onCommit(e.target.value); }} />
      <button className="bl-ingdrop-btn" type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setBrowse(true); setOpen((o) => !o); }}>▾</button>
      {open && (
        <div className="bl-ingdrop">
          {filtered.length === 0 ? <div className="bl-ingdrop-empty">No saved {kind === "inclusion" ? "inclusions" : "flours"}{(v && !browse) ? " matching" : " yet"}</div>
            : filtered.map((i) => <div key={i.id} className="bl-ingdrop-item" onMouseDown={(e) => e.preventDefault()} onClick={() => commit(i.name)}>{i.name}</div>)}
        </div>
      )}
    </div>
  );
}
const otherFlourSum = (t) => t.flours.slice(1).reduce((a, f) => a + (+f.pct || 0), 0);
const mainPct = (t) => Math.max(0, 100 - otherFlourSum(t));
const flourPctOf = (t, idx) => (idx === 0 ? mainPct(t) : (+t.flours[idx].pct || 0));

const ingLines = (t) => {
  const L = [];
  t.flours.forEach((f, i) => L.push({ key: "fl_" + f.id, name: f.name, pct: flourPctOf(t, i) }));
  L.push({ key: "water", name: "Water", pct: +t.water || 0 });
  L.push({ key: "salt", name: "Salt", pct: +t.salt || 0 });
  L.push({ key: "levain", name: "Levain", pct: +t.levain || 0 });
  t.inclusions.forEach((f) => L.push({ key: "in_" + f.id, name: f.name, pct: +f.pct || 0 }));
  return L;
};

// id-independent signature of a formula, with main flour normalized
const formulaKey = (r) => JSON.stringify({
  lw: +r.loafWeight, sh: r.shape || "round", w: +r.water, s: +r.salt, lv: +r.levain,
  lh: +r.levHyd || 80, li: +r.levInoc || 10, ri: +r.levRefInoc || 10, lb: +r.levBuildHrs || 5, lr: +r.levRefTemp || 24, lwh: +r.levWhole || 0, lxn: r.levExpNote || "", bt: +r.bakeTemp || 245, bm: +r.bakeMin || 45, sm: +r.steamMin || 20, au: +r.autolyse || 45, cn: r.calNote || "",
  fl: r.flours.map((f, i) => [f.name, i === 0 ? mainPct(r) : +f.pct || 0]),
  inc: r.inclusions.map((f) => [f.name, +f.pct || 0]),
});

const buildStages = (p) => {
  const s = [];
  s.push({ name: "Autolyse", min: +p.autolyse, active: false });
  s.push({ name: "Mix", min: +p.mix, active: true });
  for (let i = 1; i <= +p.folds; i++) { s.push({ name: "Rest", min: +p.restBetween, active: false }); s.push({ name: `Fold ${i}`, min: +p.fold, active: true }); }
  s.push({ name: "Bulk rest", min: +p.bulkRest, active: false });
  s.push({ name: "Pre-shape", min: +p.preShape, active: true });
  s.push({ name: "Bench rest", min: +p.benchRest, active: false });
  s.push({ name: "Shape", min: +p.shape, active: true });
  return s;
};

const parseTime = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const fmtClock = (t) => { const x = ((Math.round(t) % 1440) + 1440) % 1440; let h = Math.floor(x / 60); const m = x % 60; const ap = h >= 12 ? "p" : "a"; h = h % 12; if (h === 0) h = 12; return `${h}:${String(m).padStart(2, "0")}${ap}`; };
const fmtDur = (min) => { if (min < 60) return `${min}m`; const h = Math.floor(min / 60), m = min % 60; return m ? `${h}h ${m}m` : `${h}h`; };
const fmtG = (x) => { if (!x) return "—"; const v = Math.round(x * 10) / 10; return v >= 10 ? String(Math.round(v)) : String(v); };
const fmtKg = (g) => (g / 1000).toFixed(2) + "kg";
const fmtTemp = (c) => (Math.round(c * 10) / 10) + "°C";
const fmtWt = (g) => (g >= 1000 ? (g / 1000).toFixed(2) + " kg" : Math.round(g) + " g");
const fmtDelta = (m) => (m <= 0 ? "now" : m < 60 ? m + " min" : fmtDur(m));
const DOUGH_DENSITY = 1.1; // g/mL
const BULK_HEADROOM = 2.2; // vessel volume vs dough volume
const vesselLiters = (g) => Math.ceil((g / DOUGH_DENSITY) * BULK_HEADROOM / 1000);
const CAT_ORDER = { flour: 0, liquid: 1, inc: 2 };
const LIVE_PX = 4, LIVE_LABEL = 96, LIVE_ROW = 46, LIVE_AXIS = 22;

export default function App() {
  const [params, setParams] = useState(DEFAULTS);
  const [library, setLibrary] = useState(DEFAULT_LIBRARY); // kept for migration compat in globals load only
  const [coreRecipes, setCoreRecipes] = useState(DEFAULT_LIBRARY);
  const [remixes, setRemixes] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [starter, setStarter] = useState(DEFAULT_STARTER);
  const patchStarter = (patch) => setStarter((s) => ({ ...s, ...patch }));
  const patchStarterMFlour = (idx, patch) => setStarter((s) => { const f = [...(s.mFlour || [])]; f[idx] = { ...f[idx], ...patch }; return { ...s, mFlour: f }; });
  const addStarterMFlour = () => setStarter((s) => ({ ...s, mFlour: [...(s.mFlour || []), { id: uid(), name: "Flour", pct: 0 }] }));
  const removeStarterMFlour = (idx) => setStarter((s) => ({ ...s, mFlour: (s.mFlour || []).filter((_, i) => i !== idx) }));
  const patchStarterHydCal = (idx, patch) => setStarter((s) => { const c = [...(s.hydCal || [])]; c[idx] = { ...c[idx], ...patch }; return { ...s, hydCal: c }; });
  const patchStarterWholeCal = (idx, patch) => setStarter((s) => { const c = [...(s.wholeCal || [])]; c[idx] = { ...c[idx], ...patch }; return { ...s, wholeCal: c }; });
  const markFedToday = () => setStarter((s) => ({ ...s, lastFed: todayISO() }));
  const [homeTab, setHomeTab] = useState("bakedays");
  const [builderView, setBuilderView] = useState("list"); // "list" | "edit"
  const [editingRecipeId, setEditingRecipeId] = useState(null);
  const [editingIsRemix, setEditingIsRemix] = useState(false);
  const [editingDraft, setEditingDraft] = useState(null);
  const [slots, setSlots] = useState(DEFAULT_SLOTS);
  const [maxBatch, setMaxBatch] = useState(19000);
  const [ambientTemp, setAmbientTemp] = useState(21);
  const [starterTemp, setStarterTemp] = useState(21);
  const [inocCal, setInocCal] = useState([{ inoc: 10, hrs: 5 }, { inoc: 5, hrs: 6.5 }]);
  const setCal = (idx, key, v) => setInocCal((c) => c.map((p, i) => (i === idx ? { ...p, [key]: Math.max(0, Number(v) || 0) } : p)));
  const inocResp = useMemo(() => {
    const a = inocCal[0] || {}, b = inocCal[1] || {};
    const i1 = +a.inoc, t1 = +a.hrs, i2 = +b.inoc, t2 = +b.hrs;
    if (i1 > 0 && i2 > 0 && t1 > 0 && t2 > 0 && i1 !== i2) {
      const slope = (t2 - t1) / Math.log2(i1 / i2);
      if (isFinite(slope)) return { hrs: Math.max(0, slope), valid: true };
    }
    return { hrs: 1.5, valid: false };
  }, [inocCal]);
  const inocDoubleHrs = inocResp.hrs;
  const hydResp = useMemo(() => {
    const c = (starter.hydCal || []); const a = c[0] || {}, b = c[1] || {};
    const h1 = +a.hyd, t1 = +a.hrs, h2 = +b.hyd, t2 = +b.hrs;
    if (h1 > 0 && h2 > 0 && t1 > 0 && t2 > 0 && h1 !== h2) {
      const slope = (t1 - t2) / Math.log2(h2 / h1);
      if (isFinite(slope)) return { hrs: Math.max(0, slope), valid: true };
    }
    return { hrs: +starter.hydDoubleHrs || 1.2, valid: false };
  }, [starter.hydCal, starter.hydDoubleHrs]);
  const wholeResp = useMemo(() => {
    const c = (starter.wholeCal || []); const a = c[0] || {}, b = c[1] || {};
    const w1 = +a.whole, t1 = +a.hrs, w2 = +b.whole, t2 = +b.hrs;
    if (t1 > 0 && t2 > 0 && w1 !== w2) {
      const slope = (t1 - t2) / ((w2 - w1) / 25);
      if (isFinite(slope)) return { hrs: Math.max(0, slope), valid: true };
    }
    return { hrs: +starter.wholeAccelHrs || 1.5, valid: false };
  }, [starter.wholeCal, starter.wholeAccelHrs]);
  const q10 = Math.max(1.05, +starter.q10 || 2);
  const [tempUnit, setTempUnit] = useState("C");
  const [feedMode, setFeedMode] = useState("auto");
  const [feedTime, setFeedTime] = useState("21:00");
  const [stagger, setStagger] = useState(45);
  const [offsets, setOffsets] = useState([0, 45, 90, 135]);
  const [startTime, setStartTime] = useState("07:00");
  const [bakeDateTimes, setBakeDateTimes] = useState({});
  const [retard, setRetard] = useState({});
  const [foodSafety, setFoodSafety] = useState(defaultFoodSafety());
  const addFridge = () => setFoodSafety((fs) => ({ ...fs, fridges: [...fs.fridges, newFridge("Fridge " + (fs.fridges.length + 1))] }));
  const removeFridge = (fi) => setFoodSafety((fs) => ({ ...fs, fridges: fs.fridges.filter((_, i) => i !== fi) }));
  const setFridgeName = (fi, name) => setFoodSafety((fs) => ({ ...fs, fridges: fs.fridges.map((f, i) => i === fi ? { ...f, name } : f) }));
  const setTempVal = (fi, ri, v) => setFoodSafety((fs) => ({ ...fs, fridges: fs.fridges.map((f, i) => i !== fi ? f : { ...f, readings: f.readings.map((r, j) => {
    if (j !== ri) return r;
    const empty = v === "" || v == null;
    const stamp = (!empty && !r.time) ? { date: todayISO(), time: nowHM() } : (empty ? { date: "", time: "" } : {});
    return { ...r, temp: empty ? null : uToC(Number(v)), ...stamp };
  }) }) }));
  const restampTemp = (fi, ri) => setFoodSafety((fs) => ({ ...fs, fridges: fs.fridges.map((f, i) => i !== fi ? f : { ...f, readings: f.readings.map((r, j) => j === ri ? { ...r, date: todayISO(), time: nowHM() } : r) }) }));
  const setSaniName = (si, name) => setFoodSafety((fs) => ({ ...fs, sanitizers: fs.sanitizers.map((s, i) => i === si ? { ...s, name } : s) }));
  const setSaniVal = (si, ri, v) => setFoodSafety((fs) => ({ ...fs, sanitizers: fs.sanitizers.map((s, i) => i !== si ? s : { ...s, readings: s.readings.map((r, j) => {
    if (j !== ri) return r;
    const empty = v === "" || v == null;
    const stamp = (!empty && !r.time) ? { date: todayISO(), time: nowHM() } : (empty ? { date: "", time: "" } : {});
    return { ...r, ppm: empty ? null : Math.max(0, Number(v)), ...stamp };
  }) }) }));
  const restampSani = (si, ri) => setFoodSafety((fs) => ({ ...fs, sanitizers: fs.sanitizers.map((s, i) => i !== si ? s : { ...s, readings: s.readings.map((r, j) => j === ri ? { ...r, date: todayISO(), time: nowHM() } : r) }) }));
  const addSanitizer = () => setFoodSafety((fs) => ({ ...fs, sanitizers: [...fs.sanitizers, newSaniStation("Sani Spray #" + (fs.sanitizers.length))] }));
  const removeSanitizer = (si) => setFoodSafety((fs) => ({ ...fs, sanitizers: fs.sanitizers.filter((_, i) => i !== si) }));
  const toggleRetard = (key) => setRetard((r) => ({ ...r, [key]: !r[key] }));
  const setOvenTime = (date, v) => setBakeDateTimes((t) => ({ ...t, [date]: v }));
  const addSlotSession = (ti) => setSlots((ss) => {
    const slot = ss[ti]; const last = (slot.sessions || []).slice(-1)[0];
    const date = last ? addDaysISO(last.date, 1) : addDaysISO(todayISO(), 1);
    const newLv = Math.max(0, Math.floor(sessionLoaves(slot, 0) / 2));
    return ss.map((s, i) => (i === ti ? { ...s, sessions: [...(s.sessions || []), { id: uid(), date, loaves: newLv }] } : s));
  });
  const removeSlotSession = (ti, si) => setSlots((ss) => ss.map((s, i) => i !== ti ? s : { ...s, sessions: (s.sessions || []).filter((_, j) => j !== si) }));
  const setSlotSessionDate = (ti, si, date) => setSlots((ss) => ss.map((s, i) => i !== ti ? s : { ...s, sessions: (s.sessions || []).map((sess, j) => j === si ? { ...sess, date } : sess) }));
  const setSlotSessionLoaves = (ti, si, v) => setSlots((ss) => ss.map((s, i) => i !== ti ? s : { ...s, sessions: (s.sessions || []).map((sess, j) => j === si ? { ...sess, loaves: Math.max(0, Math.floor(Number(v) || 0)) } : sess) }));
  const handleDayDateChange = (nv) => {
    const delta = dateDiffDays(dayDate, nv);
    if (delta !== 0) setSlots((ss) => ss.map((s) => ({ ...s, sessions: (s.sessions || []).map((sess) => ({ ...sess, date: addDaysISO(sess.date, delta) })) })));
    setDayDate(nv);
  };
  const [drag, setDrag] = useState(null);
  const [hover, setHover] = useState(null);
  const [tab, setTab] = useState("plan");
  const [navShow, setNavShow] = useState(false);
  const [showCal, setShowCal] = useState(false);
  const [activeBatch, setActiveBatch] = useState(null);
  const [doneBatches, setDoneBatches] = useState([]);
  const [calcOpen, setCalcOpen] = useState(false);
  const [mixWaterTemp, setMixWaterTemp] = useState(null); // internal °C, null = unset
  const [calcInputs, setCalcInputs] = useState(null); // last calculator inputs, internal °C
  const [delTarget, setDelTarget] = useState(null); // {id,name,kind} recipe pending delete confirmation
  const [labelOpen, setLabelOpen] = useState(false);
  const [labelOffX, setLabelOffX] = useState(0); // calibration nudge, mm
  const [labelOffY, setLabelOffY] = useState(0);
  const [nowMin, setNowMin] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
  useEffect(() => { const id = setInterval(() => { const d = new Date(); setNowMin(d.getHours() * 60 + d.getMinutes()); }, 20000); return () => clearInterval(id); }, []);
  const tabsRef = useRef(null);
  const lastScrollY = useRef(0);
  const [navHidden, setNavHidden] = useState(false);
  // hide the sticky nav when scrolling down, reveal when scrolling up (mobile)
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || 0;
      if (y < 150) setNavHidden(false);
      else if (y > lastScrollY.current + 6) setNavHidden(true);
      else if (y < lastScrollY.current - 6) setNavHidden(false);
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // keep the active tab pill centered in the scrolling nav
  useEffect(() => {
    const c = tabsRef.current; if (!c) return;
    const el = c.querySelector(".bl-tab.on"); if (!el) return;
    const target = el.offsetLeft - (c.clientWidth - el.clientWidth) / 2;
    c.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [tab]);
  const goTab = (k) => { setTab(k); if (typeof window !== "undefined") window.scrollTo({ top: 0 }); };
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("home");
  const [days, setDays] = useState([]);
  const [currentDayId, setCurrentDayId] = useState(null);
  const [dayName, setDayName] = useState("New bake day");
  const [dayDate, setDayDate] = useState(todayISO());
  const persist = (k, v) => { try { if (typeof window !== "undefined" && window.storage) window.storage.set(k, JSON.stringify(v)); } catch (e) {} };
  const loadDayVars = (d) => {
    setParams({ ...DEFAULTS, ...(d.params || {}) });
    setSlots(normalizeSlots(d.slots));
    setMaxBatch(typeof d.maxBatch === "number" ? d.maxBatch : 19000);
    setAmbientTemp(typeof d.ambientTemp === "number" ? d.ambientTemp : 21);
    setStarterTemp(typeof d.starterTemp === "number" ? d.starterTemp : 21);
    setFeedMode(d.feedMode === "manual" ? "manual" : "auto");
    setFeedTime(typeof d.feedTime === "string" ? d.feedTime : "21:00");
    setStagger(typeof d.stagger === "number" ? d.stagger : 45);
    setOffsets(Array.isArray(d.offsets) ? d.offsets : [0, 45, 90, 135]);
    setStartTime(d.startTime || "07:00");
    setBakeDateTimes(d.bakeDateTimes && typeof d.bakeDateTimes === "object" ? d.bakeDateTimes : {});
    // migrate old bakeSessions oven times into bakeDateTimes if present
    if (!d.bakeDateTimes && Array.isArray(d.bakeSessions)) {
      const dt = {}; d.bakeSessions.forEach((s) => { if (s.date && s.startTime) dt[s.date] = s.startTime; }); setBakeDateTimes(dt);
    }
    const sl = normalizeSlots(d.slots); void sl; // ensure normalizeSlots runs; sessions already applied in setSlots above
    setRetard(d.retard && typeof d.retard === "object" ? d.retard : {});
    setFoodSafety(normalizeFoodSafety(d.foodSafety));
    setMixWaterTemp(typeof d.mixWaterTemp === "number" ? d.mixWaterTemp : null);
    setCalcInputs(d.calcInputs && typeof d.calcInputs === "object" ? d.calcInputs : null);
  };
  const openDay = (id) => { const e = days.find((x) => x.id === id); if (!e) return; loadDayVars(e.day || {}); setDayName(e.name || "Untitled"); setDayDate(e.date || todayISO()); setCurrentDayId(id); setTab("plan"); setActiveBatch(null); setDoneBatches([]); setView("editor"); if (typeof window !== "undefined") window.scrollTo({ top: 0 }); };
  const newDay = () => { const e = newDayEntry("New bake day", defaultDay()); setDays((ds) => { const nd = [e, ...ds]; persist(DAYS_KEY, nd); return nd; }); loadDayVars(e.day); setDayName(e.name); setDayDate(e.date); setCurrentDayId(e.id); setTab("plan"); setActiveBatch(null); setDoneBatches([]); setView("editor"); if (typeof window !== "undefined") window.scrollTo({ top: 0 }); };
  const dupDay = (id) => setDays((ds) => { const src = ds.find((d) => d.id === id); if (!src) return ds; const copy = { ...src, id: uid(), name: (src.name || "Bake day") + " (copy)", updatedAt: Date.now(), day: JSON.parse(JSON.stringify(src.day || defaultDay())) }; const nd = [copy, ...ds]; persist(DAYS_KEY, nd); return nd; });
  const delDay = (id) => { setDays((ds) => { const nd = ds.filter((d) => d.id !== id); persist(DAYS_KEY, nd); return nd; }); if (currentDayId === id) { setCurrentDayId(null); setView("home"); } };
  const backHome = () => { setView("home"); if (typeof window !== "undefined") window.scrollTo({ top: 0 }); };
  const stages = useMemo(() => buildStages(params), [params]);
  const cycleMin = useMemo(() => stages.reduce((s, x) => s + x.min, 0), [stages]);
  const startMin = parseTime(startTime);

  // production "types" derived from slots (formula + day quantity)
  const types = useMemo(() => slots.map((s, i) => ({ ...s.draft, loaves: s.loaves, mixOrder: s.mixOrder ?? i + 1, bakeOrder: s.bakeOrder ?? i + 1 })), [slots]);

  // ---- batch planner -------------------------------------------------------
  const plan = useMemo(() => {
    const summaries = [], perType = [];
    types.forEach((t, ti) => {
      const lines = ingLines(t);
      const pctSum = lines.reduce((a, l) => a + l.pct, 0);
      const loaves = Math.max(0, Math.floor(+t.loaves || 0));
      const W = Math.max(0, +t.loafWeight || 0);
      const totalDough = loaves * W;
      const maxLPB = (maxBatch > 0 && W > 0) ? Math.floor(maxBatch / W) : 0;
      let batchCount = 0, sizes = [];
      if (loaves > 0 && maxLPB > 0) { batchCount = Math.ceil(loaves / maxLPB); const base = Math.floor(loaves / batchCount), rem = loaves % batchCount; sizes = Array.from({ length: batchCount }, (_, i) => base + (i < rem ? 1 : 0)); }
      else if (loaves > 0) { batchCount = loaves; sizes = Array(loaves).fill(1); }
      const unit = pctSum > 0 ? totalDough / pctSum : 0;
      const perLoaf = {}; lines.forEach((l) => { perLoaf[l.key] = loaves > 0 ? (unit * l.pct) / loaves : 0; });
      perType[ti] = sizes.map((sz) => { const weights = {}; lines.forEach((l) => { weights[l.key] = perLoaf[l.key] * sz; }); return { ti, name: t.name, size: sz, dough: sz * W, weights }; });
      summaries[ti] = { ti, name: t.name, loaves, W, totalDough, batchCount, sizes, maxLPB, impossible: loaves > 0 && maxLPB <= 0, floursOver: otherFlourSum(t) > 100 };
    });
    // batch list ordered by each recipe's chosen mix order (recipe blocks stay contiguous)
    const order = [...types.keys()].sort((a, b) => ((types[a].mixOrder || 99) - (types[b].mixOrder || 99)) || (a - b));
    const list = [];
    order.forEach((ti) => { (perType[ti] || []).forEach((b) => list.push(b)); });
    return { list, summaries };
  }, [types, maxBatch]);

  const totalBatches = Math.max(1, plan.list.length);

  useEffect(() => { setOffsets((o) => { const n = [...o]; while (n.length < totalBatches) n.push(n.length * stagger); n.length = totalBatches; return n; }); }, [totalBatches]); // eslint-disable-line

  // ---- persistence: globals (shared library/settings) + days (per-day snapshots) ----
  const bootRef = useRef(false);
  useEffect(() => {
    if (bootRef.current) return; bootRef.current = true;
    (async () => {
      try {
        if (typeof window !== "undefined" && window.storage) {
          const g = await window.storage.get(GLOBALS_KEY);
          if (g && g.value) {
            const gc = JSON.parse(g.value);
            if (Array.isArray(gc.coreRecipes) && gc.coreRecipes.every((x) => Array.isArray(x.flours))) setCoreRecipes(gc.coreRecipes);
            else if (Array.isArray(gc.library) && gc.library.every((x) => Array.isArray(x.flours))) setCoreRecipes(gc.library); // migrate
            if (Array.isArray(gc.remixes)) setRemixes(gc.remixes);
            if (Array.isArray(gc.ingredients)) setIngredients(gc.ingredients.map((i) => ({ ...i, kind: i.kind === "inclusion" ? "inclusion" : "flour" })));
            if (gc.starter && typeof gc.starter === "object") setStarter({ ...DEFAULT_STARTER, ...gc.starter });
            if (Array.isArray(gc.inocCal) && gc.inocCal.length === 2) setInocCal(gc.inocCal);
            else if (typeof gc.inocDoubleHrs === "number") setInocCal([{ inoc: 10, hrs: 5 }, { inoc: 5, hrs: 5 + gc.inocDoubleHrs }]);
            if (gc.tempUnit === "C" || gc.tempUnit === "F") setTempUnit(gc.tempUnit);
          }
          let loadedDays = null;
          const dRec = await window.storage.get(DAYS_KEY);
          if (dRec && dRec.value) { const arr = JSON.parse(dRec.value); if (Array.isArray(arr)) loadedDays = arr; }
          if (!loadedDays) {
            // migrate the previous single-day config into one saved bake day + globals
            const old = await window.storage.get(STORAGE_KEY);
            if (old && old.value) {
              const c = JSON.parse(old.value);
              if (Array.isArray(c.library) && c.library.every((x) => Array.isArray(x.flours))) {
                setCoreRecipes(c.library);
                persist(GLOBALS_KEY, { coreRecipes: c.library, remixes: [], ingredients: [], inocCal: [{ inoc: 10, hrs: 5 }, { inoc: 5, hrs: 5 + (typeof c.inocDoubleHrs === "number" ? c.inocDoubleHrs : 1.5) }], tempUnit: c.tempUnit === "F" ? "F" : "C" });
              }
              const day = { params: c.params ? { ...DEFAULTS, ...c.params } : DEFAULTS, slots: normalizeSlots(c.slots), maxBatch: typeof c.maxBatch === "number" ? c.maxBatch : 19000, ambientTemp: typeof c.ambientTemp === "number" ? c.ambientTemp : 21, starterTemp: typeof c.starterTemp === "number" ? c.starterTemp : 21, feedMode: c.feedMode === "manual" ? "manual" : "auto", feedTime: typeof c.feedTime === "string" ? c.feedTime : "21:00", stagger: typeof c.stagger === "number" ? c.stagger : 45, offsets: Array.isArray(c.offsets) ? c.offsets : [0, 45, 90, 135], startTime: c.startTime || "07:00", bakeDateTimes: {}, retard: {}, foodSafety: defaultFoodSafety() };
              loadedDays = [{ id: uid(), name: "Imported bake day", date: todayISO(), updatedAt: Date.now(), day }];
            } else {
              loadedDays = [newDayEntry("My first bake day", defaultDay())];
            }
            persist(DAYS_KEY, loadedDays);
          }
          setDays(loadedDays);
        } else {
          setDays([newDayEntry("My first bake day", defaultDay())]);
        }
      } catch (e) { setDays([newDayEntry("Bake day", defaultDay())]); }
      setLoaded(true);
    })();
  }, []);
  // persist shared globals
  useEffect(() => { if (!loaded) return; persist(GLOBALS_KEY, { coreRecipes, remixes, ingredients, starter, inocCal, tempUnit }); }, [coreRecipes, remixes, ingredients, starter, inocCal, tempUnit, loaded]);
  // autosave the open day's snapshot
  useEffect(() => {
    if (!loaded || view !== "editor" || !currentDayId) return;
    const snap = { params, slots, maxBatch, ambientTemp, starterTemp, feedMode, feedTime, stagger, offsets, startTime, bakeDateTimes, retard, foodSafety, mixWaterTemp, calcInputs };
    setDays((ds) => { const nd = ds.map((d) => (d.id === currentDayId ? { ...d, name: dayName, date: dayDate, updatedAt: Date.now(), day: snap } : d)); persist(DAYS_KEY, nd); return nd; });
  }, [params, slots, maxBatch, ambientTemp, starterTemp, feedMode, feedTime, stagger, offsets, startTime, bakeDateTimes, retard, foodSafety, mixWaterTemp, calcInputs, dayName, dayDate, currentDayId, view, loaded]);

  const distribute = (s) => { setStagger(s); setOffsets(Array.from({ length: totalBatches }, (_, b) => b * s)); };

  // ---- schedule ------------------------------------------------------------
  const schedule = useMemo(() => offsets.map((base, b) => {
    const ti = plan.list[b] ? plan.list[b].ti : 0;
    const aut = types[ti] && types[ti].autolyse != null ? +types[ti].autolyse : +params.autolyse;
    const st = buildStages({ ...params, autolyse: aut });
    let cur = base;
    const blocks = st.map((stg) => { const bl = { batch: b, name: stg.name, active: stg.active, startOff: cur, endOff: cur + stg.min, min: stg.min }; cur += stg.min; return bl; });
    return { batch: b, base, end: cur, blocks };
  }), [offsets, params, plan, types]);

  const { collisionSet, collisionCount } = useMemo(() => {
    const acts = [];
    schedule.forEach((row) => row.blocks.forEach((bl, i) => { if (bl.active && bl.min > 0) acts.push({ ...bl, key: `${bl.batch}-${i}` }); }));
    const set = new Set();
    for (let i = 0; i < acts.length; i++) for (let j = i + 1; j < acts.length; j++) { const a = acts[i], c = acts[j]; if (a.batch === c.batch) continue; if (a.startOff < c.endOff && c.startOff < a.endOff) { set.add(a.key); set.add(c.key); } }
    return { collisionSet: set, collisionCount: set.size };
  }, [schedule]);

  const autoSpace = useCallback(() => {
    const offs = []; let o = 0;
    stages.forEach((st) => { if (st.active && st.min > 0) offs.push({ s: o, e: o + st.min }); o += st.min; });
    if (offs.length === 0 || totalBatches < 2) return;
    const collides = (stg) => { for (let b = 0; b < totalBatches; b++) for (let c = b + 1; c < totalBatches; c++) { const sB = b * stg, sC = c * stg; for (const x of offs) for (const y of offs) if (sB + x.s < sC + y.e && sC + y.s < sB + x.e) return true; } return false; };
    for (let s = SNAP; s <= cycleMin + SNAP; s += SNAP) if (!collides(s)) { distribute(s); return; }
    distribute(cycleMin);
  }, [stages, totalBatches, cycleMin]); // eslint-disable-line

  const onDown = (e, b) => { if (e.pointerType === "touch") return; e.currentTarget.setPointerCapture(e.pointerId); setHover(null); setDrag({ b, startX: e.clientX, startOff: offsets[b] }); };
  const onMove = (e) => { if (!drag) return; const d = Math.round(((e.clientX - drag.startX) / PX) / SNAP) * SNAP; const no = Math.max(0, drag.startOff + d); setOffsets((o) => o.map((v, i) => (i === drag.b ? no : v))); };
  const onUp = (e) => { if (drag) { try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (x) {} setDrag(null); } };

  const handsOn = useMemo(() => {
    const list = [];
    schedule.forEach((row) => row.blocks.forEach((bl, i) => { if (bl.active && bl.min > 0) list.push({ ...bl, key: `${bl.batch}-${i}`, hit: collisionSet.has(`${bl.batch}-${i}`) }); }));
    return list.sort((a, b) => a.startOff - b.startOff || a.batch - b.batch);
  }, [schedule, collisionSet]);

  const lastEnd = schedule.length ? Math.max(...schedule.map((r) => r.end)) : cycleMin;
  const totalActiveMin = handsOn.reduce((s, x) => s + x.min, 0);

  // ---- prep/report aggregation --------------------------------------------
  const report = useMemo(() => {
    const tot = {};
    plan.list.forEach((b) => {
      const t = types[b.ti];
      ingLines(t).forEach((l) => {
        if (l.pct <= 0) return;
        const g = b.weights[l.key] || 0; if (!g) return;
        const cat = l.key.startsWith("fl_") ? "flour" : l.key.startsWith("in_") ? "inc" : "liquid";
        const key = (l.name || "").trim().toLowerCase() + "|" + cat;
        if (!tot[key]) tot[key] = { name: l.name, cat, g: 0 };
        tot[key].g += g;
      });
    });
    const ingList = Object.values(tot).sort((a, b) => (CAT_ORDER[a.cat] - CAT_ORDER[b.cat]) || b.g - a.g);
    const bann = {};
    types.forEach((t, ti) => { const lv = plan.summaries[ti].loaves; if (lv > 0) { const sh = t.shape || "round"; bann[sh] = (bann[sh] || 0) + lv; } });
    const vessels = plan.list.map((b, i) => ({ i, name: b.name, dough: b.dough, size: b.size, liters: vesselLiters(b.dough) }));
    return { ingList, bann, vessels, totalLoaves: plan.list.reduce((a, b) => a + b.size, 0), totalDough: plan.list.reduce((a, b) => a + b.dough, 0) };
  }, [plan, types]);

  // ---- levain builds (grouping, timing via water temp) ---------------------
  const levainPlan = useMemo(() => {
    const raw = [];
    types.forEach((t, ti) => {
      const batches = plan.list.map((b, gi) => ({ b, gi })).filter((x) => x.b.ti === ti);
      if (batches.length === 0) return;
      const withMix = batches.map((x) => {
        const base = schedule[x.gi] ? schedule[x.gi].base : 0;
        return { gi: x.gi, mixOff: base + ((types[ti] && types[ti].autolyse != null ? +types[ti].autolyse : +params.autolyse) || 0), levW: x.b.weights["levain"] || 0 };
      }).sort((a, b) => a.mixOff - b.mixOff);
      let group = [];
      const flush = () => { if (group.length) raw.push({ ti, name: t.name, items: group }); group = []; };
      withMix.forEach((it) => {
        if (group.length === 0) { group = [it]; return; }
        if (group.length >= 5 || (it.mixOff - group[0].mixOff) > 90) { flush(); group = [it]; }
        else group.push(it);
      });
      flush();
    });
    const builds = raw.map((bd) => {
      const t = types[bd.ti];
      const refTemp = +t.levRefTemp || 24;
      const baselineMin = (+t.levBuildHrs || 5) * 60;
      const H = +t.levHyd || 80;
      const I = Math.max(0.1, +t.levInoc || 10);          // working inoculation
      const refInoc = Math.max(0.1, +t.levRefInoc || 10);  // inoculation the baseline was calibrated at
      const whole = Math.max(0, +t.levWhole || 0);         // % whole grain in the levain flour
      const refH = +starter.refHyd || 80;
      // inoculation: less seed than calibration → longer natural rise (each halving adds inocDoubleHrs)
      const inocAdd = inocDoubleHrs * 60 * Math.log2(refInoc / I);
      // hydration: stiffer than ref → slower. hydDoubleHrs = +hrs per halving of hydration below ref
      const hydAdd = hydResp.hrs * 60 * Math.log2(Math.max(1, refH) / Math.max(1, H));
      // flour: whole grain accelerates. wholeResp.hrs = -hrs per +25% whole grain in levain flour
      const wholeAdd = -wholeResp.hrs * 60 * (whole / 25);
      const baseAdjMin = Math.max(30, baselineMin + inocAdd + hydAdd + wholeAdd);
      return { ...bd, refTemp, baselineMin, baseAdjMin, targetPeak: bd.items[0].mixOff, H, I, refInoc, whole, inocAdd, hydAdd, wholeAdd };
    });
    // auto feed = earliest the schedule demands (earliest build hits ref temp at its inoculation)
    let autoFeed = null;
    builds.forEach((bd) => { const f = bd.targetPeak - bd.baseAdjMin; if (autoFeed === null || f < autoFeed) autoFeed = f; });
    if (autoFeed === null) autoFeed = 0;
    const earliestTarget = builds.length ? Math.min(...builds.map((b) => b.targetPeak)) : 0;
    // manual feed = a clock time the user chooses; resolve to the latest occurrence before the first peak
    let feedOff = autoFeed;
    if (feedMode === "manual") {
      const earliestPeakAbs = startMin + earliestTarget;
      let feedAbs = parseTime(feedTime);
      while (feedAbs >= earliestPeakAbs) feedAbs -= 1440; // roll back to the night before if needed
      feedOff = feedAbs - startMin;
    }
    const out = builds.map((bd) => {
      const key = bd.items[0].gi;
      const retarded = !!retard[key];
      const desired = Math.max(1, bd.targetPeak - feedOff);
      // retarded: build at normal ref temp so it peaks naturally, then hold cold until mix
      const peakOff = retarded ? feedOff + bd.baseAdjMin : bd.targetPeak;
      const Tlev = retarded ? bd.refTemp : bd.refTemp - 10 * (Math.log(desired / bd.baseAdjMin) / Math.log(q10));
      const retardHold = retarded ? Math.max(0, bd.targetPeak - peakOff) : 0;
      const retardLate = retarded && (peakOff > bd.targetPeak);
      const M = bd.items.reduce((a, x) => a + x.levW, 0);
      const denom = 1 + bd.H / 100 + bd.I / 100;
      const flourL = M / denom, waterL = flourL * bd.H / 100, seedL = flourL * bd.I / 100;
      const mTot = flourL + waterL + seedL;
      const Twater = waterL > 0 ? (Tlev * mTot - flourL * ambientTemp - seedL * starterTemp) / waterL : Tlev;
      const holdMin = bd.items[bd.items.length - 1].mixOff - bd.targetPeak;
      return { ...bd, key, retarded, retardHold, retardLate, peakOff, desired, Tlev, M, flourL, waterL, seedL, Twater, holdMin };
    });
    return { feedOff, autoFeed, builds: out };
  }, [plan, types, schedule, params.autolyse, ambientTemp, starterTemp, feedMode, feedTime, startMin, inocDoubleHrs, hydResp, wholeResp, q10, starter.refHyd, retard]);

  // ---- bake schedule: groups per-recipe sessions by date, one oven sequential ----
  const bakePlan = useMemo(() => {
    const cap = Math.max(1, Math.floor(+params.ovenCap || 1));
    const preheat = Math.max(0, +params.preheatMin || 0);
    const recover = Math.max(0, +params.recoverMin || 0);
    // collect per-date recipe entries
    const dateMap = {};
    slots.forEach((slot, ti) => {
      const t = types[ti];
      (slot.sessions || []).forEach((sess, si) => {
        const loaves = sessionLoaves(slot, si);
        if (loaves <= 0) return;
        const date = sess.date || todayISO();
        if (!dateMap[date]) dateMap[date] = [];
        dateMap[date].push({ ti, name: t.name, loaves, bakeOrder: t.bakeOrder || ti + 1, bakeMin: Math.max(1, +t.bakeMin || 45), steamMin: Math.min(Math.max(1, +t.bakeMin || 45), Math.max(0, +t.steamMin || 0)), temp: +t.bakeTemp || 245 });
      });
    });
    const scheduleDate = (date, items) => {
      items.sort((a, b) => (a.bakeOrder - b.bakeOrder) || (a.ti - b.ti));
      const loads = [];
      items.forEach(({ ti, name, loaves, bakeMin, steamMin, temp }) => {
        const full = Math.floor(loaves / cap), rem = loaves % cap;
        const sizes = Array(full).fill(cap); if (rem > 0) sizes.push(rem);
        sizes.forEach((sz) => loads.push({ ti, name, n: sz, bakeMin, steamMin, temp }));
      });
      let cur = preheat;
      const sched = loads.map((ld, i) => { const startOff = cur, ventOff = cur + ld.steamMin, endOff = cur + ld.bakeMin; cur = endOff + recover; return { ...ld, i, startOff, ventOff, endOff }; });
      const lastOut = sched.length ? sched[sched.length - 1].endOff : preheat;
      return { date, sched, firstIn: preheat, lastOut, totalLoaves: loads.reduce((a, l) => a + l.n, 0), loadCount: sched.length };
    };
    const dateSchedules = Object.entries(dateMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => scheduleDate(date, items));
    const pool = types.map((t, ti) => {
      const shaped = (plan.summaries[ti] && plan.summaries[ti].loaves) || 0;
      const allocated = (slots[ti].sessions || []).reduce((a, _, si) => a + sessionLoaves(slots[ti], si), 0);
      return { ti, name: t.name, shaped, allocated, remaining: shaped - allocated };
    }).filter((p) => p.shaped > 0 || p.allocated > 0);
    return { cap, preheat, recover, dateSchedules, pool };
  }, [types, plan, slots, params.ovenCap, params.preheatMin, params.recoverMin]);

  // temperature unit display/input conversion (math stays in Celsius)
  const cToU = (c) => (tempUnit === "F" ? c * 9 / 5 + 32 : c);
  const uToC = (v) => (tempUnit === "F" ? (v - 32) * 5 / 9 : v);
  const showTemp = (c) => (Math.round(cToU(c) * 10) / 10) + "°" + tempUnit;

  // ---- live now/next -------------------------------------------------------
  const live = useMemo(() => {
    const nowOff = nowMin - startMin;
    const steps = handsOn.filter((h) => h.name !== "Mix");
    const upcoming = steps.filter((s) => s.startOff + Math.max(s.min, 1) > nowOff).sort((a, b) => a.startOff - b.startOff);
    const batchStatus = schedule.map((row, b) => {
      const info = plan.list[b];
      let stage = null;
      for (const bl of row.blocks) { if (nowOff >= bl.startOff && nowOff < bl.endOff) { stage = bl; break; } }
      let state, label, sub = "";
      if (nowOff < row.base) { state = "idle"; label = "Not started"; sub = "autolyse " + fmtClock(startMin + row.base); }
      else if (nowOff >= row.end) { state = "done"; label = "Shaped ✓"; }
      else if (stage && stage.active) { state = "attn"; label = stage.name + " — now"; }
      else { const next = row.blocks.find((x) => x.active && x.startOff >= nowOff); state = "rest"; label = stage ? stage.name : "—"; sub = next ? "next: " + next.name + " " + fmtClock(startMin + next.startOff) : ""; }
      return { b, name: info ? info.name : "", state, label, sub };
    });
    return { nowOff, hero: upcoming[0] || null, then: upcoming.slice(1, 6), batchStatus };
  }, [nowMin, startMin, handsOn, schedule, plan]);

  const completeAndNext = (i) => {
    const done = doneBatches.includes(i) ? doneBatches : [...doneBatches, i];
    setDoneBatches(done);
    const n = plan.list.length; let next = null;
    for (let k = 1; k <= n; k++) { const j = (i + k) % n; if (!done.includes(j)) { next = j; break; } }
    setActiveBatch(next);
  };
  const anchorNow = () => { const d = new Date(); setStartTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`); };

  // ---- live Gantt auto-follow ---------------------------------------------
  const liveRef = useRef(null);
  const progScroll = useRef(false);
  const [follow, setFollow] = useState(true);
  const [liveFull, setLiveFull] = useState(false);
  const [mixed, setMixed] = useState(false);
  const [recal, setRecal] = useState(false);
  const liveDragRef = useRef(null);
  const [vh, setVh] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 800));
  const centerNow = useCallback(() => {
    const el = liveRef.current; if (!el) return;
    const x = Math.max(0, LIVE_LABEL + (nowMin - startMin) * LIVE_PX - el.clientWidth / 3);
    progScroll.current = true;
    el.scrollTo({ left: x });
    setTimeout(() => { progScroll.current = false; }, 140);
  }, [nowMin, startMin]);
  useEffect(() => { if (tab === "fold" && follow) centerNow(); }, [tab, follow, nowMin, centerNow]);
  useEffect(() => {
    if (!liveFull) return;
    const onR = () => setVh(window.innerHeight);
    setVh(window.innerHeight);
    window.addEventListener("resize", onR);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const id = setTimeout(() => { if (follow) centerNow(); }, 80);
    return () => { window.removeEventListener("resize", onR); document.body.style.overflow = prev; clearTimeout(id); };
  }, [liveFull]); // eslint-disable-line
  const onLiveScroll = () => { if (progScroll.current) return; if (follow) setFollow(false); };
  const liveDown = (e, b) => { if (!recal) return; e.currentTarget.setPointerCapture(e.pointerId); setFollow(false); liveDragRef.current = { b, startX: e.clientX, startOff: offsets[b] }; };
  const liveMove = (e) => { const d = liveDragRef.current; if (!d) return; const dm = Math.round(((e.clientX - d.startX) / LIVE_PX) / SNAP) * SNAP; const no = Math.max(0, d.startOff + dm); setOffsets((o) => o.map((v, i) => (i === d.b ? no : v))); };
  const liveUp = (e) => { if (liveDragRef.current) { try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (x) {} liveDragRef.current = null; } };
  const span = Math.max(lastEnd, 60);
  const tickStep = span > 480 ? 60 : 30;
  const axisTicks = []; for (let t = 0; t <= span + tickStep; t += tickStep) axisTicks.push(t);

  // ---- mutators ------------------------------------------------------------
  const setP = (k, v) => setParams((p) => ({ ...p, [k]: Math.max(0, Number(v) || 0) }));
  const patchSlot = (ti, fn) => setSlots((ss) => ss.map((s, i) => (i === ti ? fn(s) : s)));
  const normalizeOrders = (ss) => {
    const byMix = [...ss.keys()].sort((a, b) => ((ss[a].mixOrder || 99) - (ss[b].mixOrder || 99)) || (a - b));
    const byBake = [...ss.keys()].sort((a, b) => ((ss[a].bakeOrder || 99) - (ss[b].bakeOrder || 99)) || (a - b));
    const mr = {}, br = {}; byMix.forEach((idx, r) => { mr[idx] = r + 1; }); byBake.forEach((idx, r) => { br[idx] = r + 1; });
    return ss.map((s, i) => ({ ...s, mixOrder: mr[i], bakeOrder: br[i] }));
  };
  // setting one card's order swaps with whoever currently holds that slot — keeps a clean 1..N permutation
  const setMixOrder = (ti, v) => setSlots((ss) => { const cur = ss[ti].mixOrder; return ss.map((s, i) => (i === ti ? { ...s, mixOrder: v } : (s.mixOrder === v ? { ...s, mixOrder: cur } : s))); });
  const setBakeOrder = (ti, v) => setSlots((ss) => { const cur = ss[ti].bakeOrder; return ss.map((s, i) => (i === ti ? { ...s, bakeOrder: v } : (s.bakeOrder === v ? { ...s, bakeOrder: cur } : s))); });
  const addSlot = () => setSlots((ss) => normalizeOrders([...ss, { loaves: 50, mixOrder: ss.length + 1, bakeOrder: ss.length + 1, draft: blankRecipe() }]));
  const removeSlot = (ti) => setSlots((ss) => (ss.length <= 1 ? ss : normalizeOrders(ss.filter((_, i) => i !== ti))));
  const patchDraft = (ti, fn) => patchSlot(ti, (s) => ({ ...s, draft: fn(s.draft) }));
  const setLoaves = (ti, v) => patchSlot(ti, (s) => ({ ...s, loaves: Math.max(0, Math.floor(Number(v) || 0)) }));
  const setDraft = (ti, patch) => patchDraft(ti, (d) => ({ ...d, ...patch }));
  const setFixed = (ti, k, v) => patchDraft(ti, (d) => ({ ...d, [k]: Math.max(0, Number(v) || 0) }));
  const setFlourName = (ti, idx, v) => patchDraft(ti, (d) => ({ ...d, flours: d.flours.map((f, j) => (j === idx ? { ...f, name: v } : f)) }));
  const setFlourPct = (ti, idx, v) => patchDraft(ti, (d) => ({ ...d, flours: d.flours.map((f, j) => (j === idx ? { ...f, pct: Math.max(0, Number(v) || 0) } : f)) }));
  const addFlour = (ti) => patchDraft(ti, (d) => ({ ...d, flours: [...d.flours, mk("Flour " + (d.flours.length + 1), 0)] }));
  const removeFlour = (ti, idx) => patchDraft(ti, (d) => ({ ...d, flours: d.flours.filter((_, j) => j !== idx) }));
  const setIncName = (ti, idx, v) => patchDraft(ti, (d) => ({ ...d, inclusions: d.inclusions.map((f, j) => (j === idx ? { ...f, name: v } : f)) }));
  const setIncPct = (ti, idx, v) => patchDraft(ti, (d) => ({ ...d, inclusions: d.inclusions.map((f, j) => (j === idx ? { ...f, pct: Math.max(0, Number(v) || 0) } : f)) }));
  const addInc = (ti) => patchDraft(ti, (d) => ({ ...d, inclusions: [...d.inclusions, mk("Inclusion " + (d.inclusions.length + 1), 0)] }));
  const removeInc = (ti, idx) => patchDraft(ti, (d) => ({ ...d, inclusions: d.inclusions.filter((_, j) => j !== idx) }));

  // ---- recipe library ------------------------------------------------------
  const loadCoreRecipe = (ti, id) => { const r = coreRecipes.find((x) => x.id === id); if (r) patchSlot(ti, (s) => ({ ...s, coreRecipeId: id, draft: cloneRecipe(r) })); };
  const remixRecipe = (ti) => {
    const slot = slots[ti];
    const originName = (slot.coreRecipeId && coreRecipes.find((r) => r.id === slot.coreRecipeId)?.name) || slot.draft?.name || "Recipe";
    const name = remixName(originName, todayISO());
    const draft = cloneRecipe(slot.draft); draft.flours = draft.flours.map((f, i) => (i === 0 ? { ...f, pct: mainPct(slot.draft) } : f));
    const remix = { ...draft, id: uid(), name };
    setRemixes((rs) => [remix, ...rs]);
  };
  // recipe builder mutators
  const openNewCore = () => { setEditingDraft({ ...blankRecipe(), id: uid() }); setEditingRecipeId(null); setEditingIsRemix(false); setBuilderView("edit"); };
  const openEditCore = (id) => { const r = coreRecipes.find((x) => x.id === id); if (r) { setEditingDraft(cloneRecipe(r)); setEditingRecipeId(id); setEditingIsRemix(false); setBuilderView("edit"); } };
  const openEditRemix = (id) => { const r = remixes.find((x) => x.id === id); if (r) { setEditingDraft(cloneRecipe(r)); setEditingRecipeId(id); setEditingIsRemix(true); setBuilderView("edit"); } };
  const cancelEdit = () => setBuilderView("list");
  const saveEdit = () => {
    if (!editingDraft) return;
    const norm = cloneRecipe(editingDraft); norm.flours = norm.flours.map((f, i) => (i === 0 ? { ...f, pct: mainPct(editingDraft) } : f));
    const r = { ...norm, id: editingRecipeId || uid() };
    if (editingIsRemix) setRemixes((rs) => rs.map((x) => x.id === r.id ? r : x));
    else setCoreRecipes((rs) => editingRecipeId ? rs.map((x) => x.id === r.id ? r : x) : [r, ...rs]);
    setBuilderView("list");
  };
  const promoteRemixToCore = (id) => { const r = remixes.find((x) => x.id === id); if (!r) return; setCoreRecipes((rs) => [{ ...r, id: uid() }, ...rs]); setRemixes((rs) => rs.filter((x) => x.id !== id)); };
  const deleteCoreRecipe = (id) => setCoreRecipes((rs) => rs.filter((x) => x.id !== id));
  const deleteRemix = (id) => setRemixes((rs) => rs.filter((x) => x.id !== id));
  const addIngredient = (name, kind) => { const n = name.trim(); if (!n || ingredients.some((i) => i.name.toLowerCase() === n.toLowerCase())) return; setIngredients((is) => [{ id: uid(), name: n, price: null, kind: kind === "inclusion" ? "inclusion" : "flour" }, ...is]); };
  const deleteIngredient = (id) => setIngredients((is) => is.filter((i) => i.id !== id));
  const toggleIngredientKind = (id) => setIngredients((is) => is.map((i) => i.id === id ? { ...i, kind: (i.kind || "flour") === "inclusion" ? "flour" : "inclusion" } : i));
  const patchEdit = (patch) => setEditingDraft((d) => d ? { ...d, ...patch } : d);
  const patchEditFlour = (idx, patch) => setEditingDraft((d) => { if (!d) return d; const f = [...d.flours]; f[idx] = { ...f[idx], ...patch }; return { ...d, flours: f }; });
  const addEditFlour = () => setEditingDraft((d) => d ? { ...d, flours: [...d.flours, mk("Flour " + (d.flours.length + 1), 0)] } : d);
  const removeEditFlour = (idx) => setEditingDraft((d) => d ? { ...d, flours: d.flours.filter((_, i) => i !== idx) } : d);
  const patchEditInc = (idx, patch) => setEditingDraft((d) => { if (!d) return d; const f = [...d.inclusions]; f[idx] = { ...f[idx], ...patch }; return { ...d, inclusions: f }; });
  const addEditInc = () => setEditingDraft((d) => d ? { ...d, inclusions: [...(d.inclusions || []), mk("Inclusion " + ((d.inclusions || []).length + 1), 0)] } : d);
  const removeEditInc = (idx) => setEditingDraft((d) => d ? { ...d, inclusions: (d.inclusions || []).filter((_, i) => i !== idx) } : d);

  const NUM = (label, key, hi) => (
    <div className="bl-field2"><label className={hi ? "hi" : ""}>{label}</label>
      <input type="number" min="0" value={params[key]} onChange={(e) => setP(key, e.target.value)} /></div>
  );

  return (
    <>
    <div className="bl-root" onFocusCapture={(e) => { const el = e.target; if (el && ((el.tagName === "INPUT" && (el.type === "text" || el.type === "number")) || el.tagName === "TEXTAREA")) { try { el.select(); } catch (err) {} } }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
        * { box-sizing:border-box; }
        .bl-root{--chrome:#1a0f07;--chrome2:#2f1c0f;--chrome3:#3d2010;--chrome-t:#f5efe3;--chrome-m:#b09070;--paper:#f4eeda;--paper2:#e8d9be;--cream:#fffdf8;--ink:#241508;--ink2:#7a5a3a;--line:#d4c4a8;--crust:#b5651d;--crust2:#8a4a14;--active:#c4521f;--passive:#dfc99a;--passive-line:#c9ad79;--sand:#a08060;--alert:#b32d24;--alert-bg:#f6d9d4;font-family:'DM Sans',system-ui,sans-serif;color:var(--ink);background:var(--paper);padding:0 22px 40px;min-height:100vh;overflow-x:clip;}
        .bl-head{background:var(--chrome);margin:0 -22px;padding:14px 22px 0;border-bottom:none;display:flex;flex-direction:column;gap:0;}
        .bl-brandstrip{display:flex;align-items:center;gap:11px;padding-bottom:12px;border-bottom:1px solid rgba(245,239,227,.08);margin-bottom:12px;}
        .bl-hap-logo-sm{height:20px;width:auto;color:var(--chrome-t);display:block;}
        .bl-prodname-sm{font-family:'Fraunces',serif;font-weight:600;font-size:16px;color:var(--chrome-m);letter-spacing:-0.2px;}
        .bl-prodname-sm::before{content:'';display:inline-block;width:1px;height:14px;background:rgba(245,239,227,.2);margin-right:11px;vertical-align:-2px;}
        .bl-dayhd{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding-bottom:12px;}
        .bl-title{font-family:'Fraunces',serif;font-weight:600;font-size:26px;line-height:1;letter-spacing:-0.5px;color:var(--ink);display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
        .bl-hap-logo{height:26px;width:auto;color:var(--ink);display:block;}
        .bl-prodname{font-family:'Fraunces',serif;font-weight:600;font-size:21px;color:var(--crust2);position:relative;padding-left:13px;}
        .bl-prodname::before{content:'';position:absolute;left:0;top:50%;transform:translateY(-50%);width:1.5px;height:20px;background:var(--line);}
        .bl-title small{flex-basis:100%;display:block;font-family:'DM Sans',sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--sand);margin-top:2px;font-weight:600;}
        .bl-back{display:inline-flex;align-items:center;justify-content:center;color:var(--chrome-m);background:transparent;border:1.5px solid rgba(245,239,227,.18);border-radius:8px;width:40px;height:40px;padding:0;cursor:pointer;flex:none;}
        .bl-back:hover{background:rgba(245,239,227,.1);color:var(--chrome-t);}
        .bl-dayid{display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:1;min-width:0;}
        .bl-dayname{font-family:'Fraunces',serif;font-weight:600;font-size:22px;color:var(--chrome-t);background:transparent;border:none;border-bottom:1.5px solid transparent;padding:2px 2px;min-width:140px;flex:1;}
        .bl-dayname::placeholder{color:var(--chrome-m);}
        .bl-dayname:hover{border-bottom-color:rgba(245,239,227,.25);}
        .bl-dayname:focus{outline:none;border-bottom-color:var(--crust);}
        .bl-daydate{font-family:'JetBrains Mono';font-size:12px;color:var(--chrome-m);background:rgba(245,239,227,.08);border:1.5px solid rgba(245,239,227,.15);border-radius:7px;padding:6px 9px;}
        .bl-unittoggle-hd{margin-left:auto;align-self:center;flex:none;height:36px;border:1.5px solid rgba(245,239,227,.18);border-radius:7px;overflow:hidden;}
        .bl-unittoggle-hd button{font-family:'JetBrains Mono';font-size:12px;font-weight:600;padding:0 11px;border:none;cursor:pointer;height:100%;}
        .bl-unittoggle-hd button.on{background:var(--crust);color:var(--chrome-t);}
        .bl-unittoggle-hd button.off{background:transparent;color:var(--chrome-m);}
        .bl-panel{background:var(--cream);border:1.5px solid var(--line);border-radius:12px;padding:18px;margin-bottom:20px;box-shadow:0 2px 8px rgba(26,15,7,.04);}
        .bl-panel h3{font-family:'Fraunces',serif;font-size:20px;margin:0 0 14px;font-weight:600;display:flex;align-items:center;gap:9px;letter-spacing:-0.3px;}
        .bl-panel h3::before{content:'◆';width:auto;height:auto;background:transparent;border-radius:0;transform:none;font-size:10px;color:var(--crust);font-family:'DM Sans';line-height:1;margin-top:1px;}
        .bl-grid{display:grid;grid-template-columns:300px 1fr;gap:24px;align-items:start;}
        .bl-grid>div{min-width:0;}
        @media (max-width:880px){.bl-grid{grid-template-columns:1fr;}}
        .bl-field{margin-bottom:13px;} .bl-field label{display:block;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--ink2);margin-bottom:5px;}
        .bl-field input{width:100%;font-family:'JetBrains Mono',monospace;font-size:15px;padding:7px 9px;border:1.5px solid var(--line);border-radius:6px;background:#fff;color:var(--ink);}
        .bl-ro{font-family:'JetBrains Mono',monospace;font-size:15px;padding:7px 9px;border:1.5px dashed var(--line);border-radius:6px;background:var(--paper2);color:var(--crust2);font-weight:600;}
        .bl-slider-val{font-family:'JetBrains Mono',monospace;font-weight:600;color:var(--crust2);float:right;}
        input[type=range]{width:100%;accent-color:var(--crust);}
        .bl-field2 label{display:block;font-size:10.5px;letter-spacing:.5px;color:var(--ink2);margin-bottom:4px;}
        .bl-field2 label.hi{color:var(--crust2);font-weight:600;} .bl-field2 label.hi::after{content:' •';color:var(--crust);}
        .bl-field2 input{width:100%;font-family:'JetBrains Mono',monospace;font-size:14px;padding:6px 8px;border:1.5px solid var(--line);border-radius:6px;background:#fff;color:var(--ink);}
        .bl-recipe{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;}
        .bl-btn{font-family:'DM Sans';font-weight:600;font-size:13px;cursor:pointer;border-radius:7px;padding:9px 12px;border:1.5px solid var(--ink);background:var(--ink);color:var(--paper);transition:.15s;}
        .bl-btn:hover{background:var(--crust2);border-color:var(--crust2);} .bl-btn.block{width:100%;}
        /* planner */
        .bl-types{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
        @media (max-width:760px){.bl-types{grid-template-columns:1fr;}}
        .bl-type{border:1.5px solid var(--line);border-radius:12px;padding:14px;background:var(--cream);min-width:0;overflow:hidden;box-shadow:0 2px 10px rgba(26,15,7,.05);}
        .bl-card-hd{display:flex;justify-content:space-between;align-items:center;background:var(--chrome2);margin:-14px -14px 12px;padding:11px 14px;border-radius:0;}
        .bl-card-hd .cardno{font-family:'JetBrains Mono';font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--chrome-m);font-weight:600;}
        .bl-rmcard{font-family:'DM Sans';font-size:11px;color:#fca5a5;background:none;border:none;cursor:pointer;padding:3px 4px;border-radius:5px;}
        .bl-rmcard:hover{background:rgba(255,100,100,.15);}
        .bl-orders{display:flex;gap:10px;margin-bottom:12px;}
        .bl-orders>div{flex:1;display:flex;flex-direction:column;gap:4px;}
        .bl-orders label{font-size:11px;color:var(--ink2);font-family:'DM Sans';}
        .bl-orders select{font-family:'DM Sans';font-size:14px;padding:7px 8px;border:1.5px solid var(--line);border-radius:7px;background:#fff;color:var(--ink);}
        .bl-addrec{display:block;width:100%;margin-top:14px;padding:11px;font-family:'DM Sans';font-size:14px;font-weight:600;color:var(--crust2);background:#fff;border:1.5px dashed var(--crust);border-radius:9px;cursor:pointer;}
        .bl-addrec:hover{background:var(--paper2);}
        .bl-calnote{flex-basis:100%;width:100%;margin-top:4px;font-family:'DM Sans';font-size:12.5px;line-height:1.4;padding:8px 10px;border:1.5px solid var(--line);border-radius:7px;background:#fff;color:var(--ink);resize:vertical;box-sizing:border-box;}
        .bl-calnote::placeholder{color:var(--ink2);opacity:.7;}
        .bl-ordbadge{font-style:normal;font-family:'JetBrains Mono';font-size:10px;color:var(--crust2);background:var(--paper2);padding:2px 6px;border-radius:5px;font-weight:600;}
        .bl-bakesum{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0 12px;}
        .bl-bakesum>div{flex:1;min-width:88px;border:1.5px solid var(--line);border-radius:9px;padding:10px 12px;background:#fffdf8;display:flex;flex-direction:column;gap:2px;}
        .bl-bakesum .v{font-family:'JetBrains Mono';font-weight:700;font-size:18px;color:var(--crust2);}
        .bl-bakesum .l{font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:var(--ink2);}
        .bl-preheat{font-size:12.5px;color:var(--ink2);background:#fff4e6;border:1px solid #f0d6b0;border-radius:8px;padding:9px 12px;margin-bottom:12px;}
        .bl-preheat b{font-family:'JetBrains Mono';color:var(--crust2);}
        .bl-loads{display:flex;flex-direction:column;gap:0;}
        .bl-recover{font-family:'JetBrains Mono';font-size:11px;color:var(--ink2);text-align:center;padding:5px 0;opacity:.8;}
        .bl-load{display:flex;gap:12px;align-items:stretch;border:1.5px solid var(--line);border-radius:9px;background:#fffdf8;padding:11px 13px;}
        .bl-load .lo-no{flex:none;width:30px;height:30px;border-radius:50%;background:var(--crust);color:var(--paper);font-family:'JetBrains Mono';font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center;}
        .bl-load .lo-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:7px;}
        .bl-load .lo-hd{display:flex;align-items:baseline;gap:10px;}
        .bl-load .lo-nm{font-family:'Fraunces',serif;font-weight:600;font-size:15px;color:var(--ink);}
        .bl-load .lo-n{font-family:'JetBrains Mono';font-size:11px;color:var(--ink2);}
        .bl-load .lo-temp{margin-left:auto;font-family:'JetBrains Mono';font-weight:600;font-size:13px;color:#a8401a;}
        .bl-load .lo-bar{display:flex;height:9px;border-radius:5px;overflow:hidden;background:var(--paper2);}
        .bl-load .lo-bar .seg.steam{background:repeating-linear-gradient(45deg,#c47a3a,#c47a3a 5px,#b86c2c 5px,#b86c2c 10px);}
        .bl-load .lo-bar .seg.vent{background:#e2cda3;}
        .bl-load .lo-times{display:flex;justify-content:space-between;gap:8px;font-size:11.5px;color:var(--ink2);}
        .bl-load .lo-times b{font-family:'JetBrains Mono';color:var(--crust2);}
        .bl-load .lo-times .vent{color:#a8401a;font-family:'JetBrains Mono';}
        .bl-pool{border:1.5px solid var(--line);border-radius:9px;background:var(--paper2);padding:12px 14px;margin:16px 0 18px;}
        .bl-pool-hd{font-family:'JetBrains Mono';font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--crust2);font-weight:600;margin-bottom:8px;}
        .bl-pool-row{display:flex;align-items:baseline;gap:10px;padding:5px 0;border-top:1px dashed var(--line);}
        .bl-pool-row:first-of-type{border-top:none;}
        .bl-pool-row .pr-nm{font-family:'Fraunces',serif;font-weight:600;font-size:15px;color:var(--ink);flex:1;min-width:0;}
        .bl-pool-row .pr-fig{font-family:'JetBrains Mono';font-size:12px;color:var(--ink2);}
        .bl-pool-row .pr-rem{font-family:'JetBrains Mono';font-size:11px;font-weight:600;color:var(--crust2);min-width:118px;text-align:right;}
        .bl-pool-row .pr-rem.done{color:#3a7d44;} .bl-pool-row .pr-rem.over{color:var(--alert);}
        .bl-pool-row.over .pr-nm{color:var(--alert);}
        .bl-session{border:1.5px solid var(--line);border-radius:11px;background:#fffdf8;padding:14px;margin-bottom:14px;}
        .bl-session-hd{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;padding-bottom:12px;border-bottom:1.5px solid var(--line);}
        .bl-session-hd .ss-no{font-family:'Fraunces',serif;font-weight:600;font-size:18px;color:var(--ink);}
        .bl-session-hd .ss-start{display:flex;align-items:center;gap:6px;}
        .bl-session-hd .ss-start label{font-size:12px;color:var(--ink2);}
        .bl-session-hd .bl-rmcard{margin-left:auto;}
        .bl-alloc{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px;}
        .bl-alloc .al-cell{display:flex;flex-direction:column;gap:4px;width:108px;}
        .bl-alloc .al-cell label{font-size:11px;color:var(--ink2);font-family:'DM Sans';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .bl-alloc .al-cell input{font-family:'JetBrains Mono';font-size:15px;padding:7px 9px;border:1.5px solid var(--line);border-radius:7px;background:#fff;}
        .bl-sessempty{font-size:13px;color:var(--ink2);opacity:.7;padding:4px 0 6px;}
        .bl-sesslist{display:flex;flex-direction:column;gap:8px;margin-bottom:12px;}
        .bl-rec-sessions{margin-top:10px;padding-top:10px;border-top:1px dashed var(--line);}
        .bl-sess-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:5px 0;border-bottom:1px solid #f3ece0;}
        .bl-sess-row:last-of-type{border-bottom:none;}
        .bl-sess-row .ss-no{font-family:'Fraunces',serif;font-weight:600;font-size:13px;color:var(--crust2);min-width:72px;}
        .bl-sess-row input[type="date"]{font-family:'JetBrains Mono';font-size:13px;padding:6px 8px;border:1.5px solid var(--line);border-radius:6px;background:#fff;color:var(--ink);}
        .bl-sess-row .ss-lv-auto{font-family:'JetBrains Mono';font-weight:700;font-size:14px;color:var(--crust2);}
        .bl-sess-row .ss-lv{width:58px;}
        .bl-sess-row .ss-lvu{font-size:12px;color:var(--ink2);}
        .bl-sess-row.over .ss-no,.bl-sess-row.over .ss-lv-auto{color:var(--alert);}
        .bl-addrow{font-family:'DM Sans';font-size:13px;font-weight:600;color:var(--crust2);background:transparent;border:1.5px dashed var(--crust);border-radius:7px;padding:6px 12px;cursor:pointer;margin-top:8px;}
        .bl-addrow:hover{background:var(--paper2);}
        .bl-date-schedules{display:flex;flex-direction:column;gap:16px;margin-top:16px;}
        .bl-datesect{border:1.5px solid var(--line);border-radius:9px;overflow:hidden;}
        .bl-datesect-hd{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:10px 14px;background:var(--paper2);border-bottom:1.5px solid var(--line);}
        .bl-datesect-hd .ds-date{font-family:'JetBrains Mono';font-weight:700;font-size:15px;color:var(--crust2);}
        .bl-datesect-hd .ss-start{display:flex;align-items:center;gap:6px;margin-left:auto;}
        .bl-datesect-hd .ss-start label{font-size:12px;color:var(--ink2);}
        .bl-datesect .bl-preheat{margin:10px 14px 6px;border-radius:7px;}
        .bl-datesect .bl-loads{padding:0 10px 10px;display:flex;flex-direction:column;gap:8px;}
        .bl-sessrow{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
        .bl-sessrow .ss-no{font-family:'Fraunces',serif;font-weight:600;font-size:15px;color:var(--ink);min-width:84px;}
        .bl-session-hd .ss-date{font-family:'JetBrains Mono';font-size:13px;color:var(--crust2);font-weight:600;background:var(--paper2);border-radius:7px;padding:7px 11px;}
        .dc-bake{font-family:'JetBrains Mono';font-size:11px;color:var(--crust2);}
        .bl-home-tabs{display:inline-flex;border:1.5px solid var(--line);border-radius:9px;overflow:hidden;}
        .bl-home-tabs button{font-family:'DM Sans';font-size:13px;font-weight:600;padding:9px 18px;border:none;background:var(--cream);color:var(--ink2);cursor:pointer;}
        .bl-home-tabs button.on{background:var(--chrome2);color:var(--chrome-t);}
        .bl-starter{max-width:760px;}
        .bl-st-hero{display:flex;align-items:center;justify-content:space-between;gap:16px;background:var(--chrome2);border-radius:14px;padding:18px 20px;margin-bottom:18px;}
        .bl-st-name{font-family:'Fraunces',serif;font-weight:600;font-size:26px;color:var(--chrome-t);line-height:1;}
        .bl-st-est{font-family:'DM Sans';font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--chrome-m);font-weight:600;margin-top:7px;}
        .bl-st-status{display:flex;align-items:center;gap:10px;background:rgba(245,239,227,.07);border:1px solid rgba(245,239,227,.13);border-radius:10px;padding:9px 14px;}
        .bl-st-status .sts-dot{width:11px;height:11px;border-radius:50%;flex:none;}
        .bl-st-status .sts-text{display:flex;flex-direction:column;line-height:1.25;}
        .bl-st-status .sts-text b{font-family:'DM Sans';font-size:13px;color:var(--chrome-t);}
        .bl-st-status .sts-text span{font-family:'JetBrains Mono';font-size:10px;color:var(--chrome-m);}
        .bl-st-status.fresh .sts-dot{background:#6fae54;box-shadow:0 0 0 3px rgba(111,174,84,.25);}
        .bl-st-status.due .sts-dot{background:#d9a93b;box-shadow:0 0 0 3px rgba(217,169,59,.25);}
        .bl-st-status.overdue .sts-dot{background:#cf5347;box-shadow:0 0 0 3px rgba(207,83,71,.25);}
        .bl-st-panel{background:var(--cream);border:1.5px solid var(--line);border-radius:12px;padding:18px;margin-bottom:16px;box-shadow:0 2px 8px rgba(26,15,7,.04);}
        .bl-st-panel h3{font-family:'Fraunces',serif;font-size:19px;margin:0 0 13px;font-weight:600;display:flex;align-items:center;gap:9px;}
        .bl-st-panel h3::before{content:'◆';font-size:9px;color:var(--crust);}
        .bl-st-feedtop{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px;}
        .bl-st-feedtop .bl-field2{flex:1;min-width:96px;}
        .bl-st-subhead{font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:var(--sand);font-weight:600;margin:14px 0 8px;}
        .bl-st-recipe{background:var(--chrome2);border-radius:11px;padding:14px 16px;margin-top:14px;}
        .bl-st-recipe .str-hd{font-family:'Fraunces',serif;font-weight:600;font-size:15px;color:var(--chrome-t);margin-bottom:9px;}
        .bl-st-recipe .str-row{display:flex;justify-content:space-between;align-items:baseline;padding:5px 0;border-bottom:1px solid rgba(245,239,227,.1);font-size:13px;color:var(--chrome-m);}
        .bl-st-recipe .str-row:last-child{border-bottom:none;}
        .bl-st-recipe .str-row b{font-family:'JetBrains Mono';font-size:13px;color:var(--chrome-t);font-weight:600;}
        .bl-st-recipe .str-row.sub{padding-left:14px;font-size:12px;opacity:.85;}
        .bl-st-recipe .str-row.sub span::before{content:'└ ';opacity:.5;}
        .bl-st-recipe .str-row.tot{margin-top:3px;border-top:1.5px solid rgba(245,239,227,.2);padding-top:8px;}
        .bl-st-recipe .str-row.tot b{font-size:15px;color:var(--crust);}
        .bl-st-fridgenote{font-size:12px;color:var(--ink2);line-height:1.5;margin-top:12px;background:#eaf1f8;border-radius:8px;padding:10px 12px;}
        .bl-st-inline-num{width:50px;font-family:'JetBrains Mono';font-size:12px;padding:3px 6px;border:1.5px solid var(--line);border-radius:6px;margin-left:4px;}
        .bl-feed-btn{align-self:flex-end;font-family:'DM Sans';font-size:13px;font-weight:600;color:var(--chrome-t);background:var(--crust);border:none;border-radius:8px;padding:9px 16px;cursor:pointer;height:fit-content;}
        .bl-feed-btn:hover{background:var(--crust2);}
        .bl-st-caltext{font-size:12px;color:var(--ink2);line-height:1.4;margin-bottom:6px;}
        .bl-st-cal{display:flex;flex-direction:column;gap:7px;margin-bottom:8px;}
        .bl-subhead{font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:var(--sand);font-weight:600;margin:14px 0 7px;}
        .bl-lev-sh{display:flex;align-items:center;gap:8px;}
        .bl-lev-starter{font-family:'DM Sans';font-size:10px;font-weight:600;letter-spacing:.5px;color:var(--crust);}
        .bl-lev-section{border:1.5px solid var(--passive-line);border-radius:10px;padding:12px;background:var(--paper);margin-bottom:4px;}
        .bl-lev-section .bl-fixed{margin-bottom:10px;}
        .bl-lev-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px;}
        @media (max-width:600px){.bl-lev-grid{grid-template-columns:1fr 1fr;}}
        .bl-lev-grid .wrap2{display:flex;align-items:center;gap:4px;}
        .bl-lev-grid .wrap2 input{width:100%;}
        .bl-lev-grid .wrap2 .pc{font-size:12px;color:var(--ink2);}
        .bl-lev-exp{display:flex;flex-direction:column;gap:4px;margin-bottom:8px;}
        .bl-lev-exp label{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--sand);font-weight:600;}
        .bl-lev-expnote{font-family:'DM Sans';font-size:13px;padding:8px 10px;border:1.5px solid var(--line);border-radius:7px;background:var(--cream);color:var(--ink);width:100%;}
        .bl-lev-hint{font-size:11px;color:var(--ink2);line-height:1.4;font-style:italic;}
        .bl-rec-title{font-family:'Fraunces',serif;font-weight:600;font-size:18px;color:var(--ink);line-height:1.2;}
        .bl-rec-none{font-style:italic;font-size:14px;color:var(--ink2);font-family:'DM Sans';font-weight:400;}
        .bl-loadsel-core{font-family:'DM Sans';font-size:14px;padding:8px 10px;border:1.5px solid var(--line);border-radius:8px;background:var(--paper2);color:var(--crust2);width:100%;}
        .bl-remix-btn{width:100%;margin-top:12px;padding:11px;font-family:'DM Sans';font-size:14px;font-weight:600;color:var(--crust);background:#fff;border:1.5px solid var(--crust);border-radius:9px;cursor:pointer;}
        .bl-remix-btn:hover{background:var(--paper2);}
        .bl-builder-list{display:flex;flex-direction:column;gap:4px;}
        .bl-builder-sh{margin:12px 0 8px;}
        .bl-recipe-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-bottom:6px;}
        .bl-recipe-card{position:relative;border:1.5px solid var(--line);border-radius:12px;background:var(--cream);padding:0;cursor:pointer;transition:border-color .15s,box-shadow .15s;overflow:hidden;box-shadow:0 2px 8px rgba(26,15,7,.04);}
        .bl-recipe-card:hover{border-color:var(--crust);box-shadow:0 4px 16px rgba(26,15,7,.1);}
        .bl-recipe-card.remix{border-color:#c5b4e3;}
        .brc-band{background:var(--chrome2);padding:12px 14px;}
        .brc-band .brc-name{font-family:'Fraunces',serif;font-weight:600;font-size:17px;color:var(--chrome-t);padding-right:26px;}
        .bl-recipe-card.remix .brc-band{background:#2a1840;}
        .brc-body{padding:10px 14px 12px;display:flex;flex-direction:column;gap:3px;}
        .brc-body .brc-meta{font-size:11.5px;color:var(--ink2);line-height:1.4;}
        .brc-body .brc-acts{display:flex;gap:6px;margin-top:6px;}
        .bl-recipe-card .brc-del{position:absolute;top:9px;right:9px;width:24px;height:24px;border:none;background:transparent;color:var(--chrome-m);font-size:15px;cursor:pointer;border-radius:4px;}
        .bl-recipe-card .brc-del:hover{background:rgba(255,100,100,.2);color:#fca5a5;}
        .bl-recipe-card .brc-promote{font-family:'DM Sans';font-size:12px;font-weight:600;color:#5a3fa0;background:#ede8f8;border:none;border-radius:7px;padding:5px 10px;cursor:pointer;}
        .bl-re-hd{display:flex;align-items:center;gap:12px;margin-bottom:18px;padding-bottom:14px;border-bottom:1.5px solid var(--line);}
        .bl-re-title{font-family:'Fraunces',serif;font-weight:600;font-size:20px;color:var(--ink);}
        .bl-re-form{display:flex;flex-direction:column;gap:10px;}
        .bl-re-row{display:flex;gap:10px;flex-wrap:wrap;}
        .bl-re-row .bl-field2{width:120px;flex:1;}
        .bl-re-name-input{width:100%;font-family:'Fraunces',serif;font-weight:600;font-size:18px;padding:8px 10px;border:1.5px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);}
        .bl-promote-btn{padding:11px;font-family:'DM Sans';font-size:14px;font-weight:600;color:#5a3fa0;background:#ede8f8;border:none;border-radius:9px;cursor:pointer;}
        .bl-ing-manager{display:flex;flex-direction:column;gap:6px;}
        .bl-ing-list{display:flex;flex-direction:column;gap:4px;}
        .bl-ing-row{display:flex;align-items:center;gap:8px;padding:6px 10px;background:#fffdf8;border:1px solid var(--line);border-radius:7px;}
        .bl-ing-row .ir-kind{font-family:'DM Sans';font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;border:none;border-radius:6px;padding:4px 9px;cursor:pointer;}
        .bl-ing-row .ir-kind.flr{background:var(--paper2);color:var(--crust2);}
        .bl-ing-row .ir-kind.inc{background:#e7eef0;color:#3a6b80;}
        .bl-ing-kindtoggle{display:inline-flex;border:1.5px solid var(--line);border-radius:8px;overflow:hidden;flex:none;}
        .bl-ing-kindtoggle button{font-family:'DM Sans';font-size:12px;font-weight:600;padding:8px 12px;border:none;background:var(--cream);color:var(--ink2);cursor:pointer;}
        .bl-ing-kindtoggle button.on{background:var(--chrome2);color:var(--chrome-t);}
        .bl-ing-row .ir-name{flex:1;font-family:'DM Sans';font-size:14px;color:var(--ink);}
        .bl-ing-row .ir-price{font-family:'JetBrains Mono';font-size:12px;color:var(--crust2);}
        .bl-ing-add{display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;align-items:center;}
        .bl-ing-input{flex:1;min-width:140px;font-family:'DM Sans';font-size:14px;padding:8px 10px;border:1.5px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);}
        .bl-ingwrap{position:relative;display:flex;align-items:center;flex:1;min-width:0;}
        .bl-ingwrap .ing-name{flex:1;min-width:0;width:100%;padding-right:30px;}
        .bl-ingdrop-btn{position:absolute;right:4px;width:24px;height:100%;border:none;background:transparent;color:var(--ink2);cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;}
        .bl-ingdrop{position:absolute;top:100%;left:0;right:0;z-index:200;background:#fff;border:1.5px solid var(--crust);border-radius:8px;box-shadow:0 6px 18px rgba(42,29,18,.14);max-height:160px;overflow-y:auto;margin-top:3px;}
        .bl-ingdrop-item{padding:9px 12px;font-family:'DM Sans';font-size:13px;color:var(--ink);cursor:pointer;}
        .bl-ingdrop-item:hover{background:var(--paper2);}
        .bl-ingdrop-empty{padding:9px 12px;font-size:12px;color:var(--ink2);font-style:italic;}
        .bl-rec-top{display:grid;grid-template-columns:1fr 64px 78px;gap:8px;align-items:end;margin-bottom:8px;}
        .bl-rec-top.two{grid-template-columns:1fr 120px;}
        .bl-qty{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
        .bl-qty .nm{flex:1;min-width:0;font-size:13px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .bl-qty input{width:74px;flex:none;font-family:'JetBrains Mono';font-size:14px;padding:6px 8px;border:1.5px solid var(--line);border-radius:6px;background:#fff;color:var(--ink);text-align:right;}
        .bl-rec-top label{display:block;font-size:9.5px;letter-spacing:.5px;text-transform:uppercase;color:var(--ink2);margin-bottom:3px;}
        .bl-rec-top select{width:100%;font-family:'DM Sans';font-size:13px;padding:7px 7px;border:1.5px solid var(--line);border-radius:6px;background:#fff;color:var(--ink);cursor:pointer;}
        .bl-rec-top input.n{width:100%;font-family:'JetBrains Mono',monospace;font-size:14px;padding:7px 6px;border:1.5px solid var(--line);border-radius:6px;background:#fff;}
        .bl-rec-name{display:flex;gap:7px;align-items:center;margin-bottom:3px;flex-wrap:wrap;}
        .bl-loadsel{flex:none;font-family:'DM Sans';font-size:13px;padding:7px 8px;border:1.5px solid var(--line);border-radius:6px;background:var(--paper2);color:var(--crust2);max-width:130px;}
        .bl-namelabel{display:block;font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:var(--ink2);font-family:'DM Sans';margin-bottom:5px;}
        .bl-rec-name .nm{flex:1 1 100%;min-width:0;font-family:'Fraunces',serif;font-weight:600;font-size:16px;padding:6px 9px;border:1.5px solid var(--line);border-radius:6px;background:#fff;color:var(--ink);}
        .bl-save{font-family:'DM Sans';font-weight:600;font-size:12px;padding:8px 13px;border-radius:6px;border:1.5px solid var(--crust2);background:var(--crust2);color:var(--paper);cursor:pointer;flex:none;}
        .bl-save:hover{background:var(--crust);border-color:var(--crust);}
        .bl-save.saved{background:transparent;color:var(--ink2);border-color:var(--line);cursor:default;}
        .bl-recmod{font-size:10.5px;color:var(--crust);font-style:italic;margin-bottom:6px;height:14px;}
        .bl-subhead{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--crust2);font-weight:600;margin:13px 0 7px;}
        .ing-row{display:flex;gap:7px;align-items:center;margin-bottom:6px;}
        .ing-name{flex:1;min-width:0;font-family:'DM Sans';font-size:13px;padding:6px 8px;border:1.5px solid var(--line);border-radius:6px;background:#fff;color:var(--ink);}
        .ing-pct{display:flex;align-items:center;width:80px;flex:none;position:relative;}
        .ing-pct input{width:100%;font-family:'JetBrains Mono';font-size:13px;padding:6px 17px 6px 7px;border:1.5px solid var(--line);border-radius:6px;background:#fff;text-align:right;}
        .ing-pct em{position:absolute;right:7px;font-style:normal;font-size:11px;color:var(--ink2);pointer-events:none;}
        .ing-pct.main{background:var(--paper2);border:1.5px dashed var(--line);border-radius:6px;padding:6px 8px;justify-content:flex-end;gap:4px;white-space:nowrap;overflow:hidden;}
        .ing-pct.main span{font-family:'JetBrains Mono';font-size:13px;font-weight:600;color:var(--crust2);} .ing-pct.main em{position:static;}
        .ing-pct.main b{position:absolute;left:6px;font-size:7.5px;letter-spacing:.5px;text-transform:uppercase;color:var(--crust);font-weight:700;}
        .ing-x{width:28px;height:30px;flex:none;border:1.5px solid var(--line);background:#fff;border-radius:6px;cursor:pointer;color:var(--ink2);font-size:15px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0;}
        .ing-x:hover{background:var(--alert);border-color:var(--alert);color:#fff;} .ing-x.ph{visibility:hidden;cursor:default;}
        .ing-empty{font-size:11px;color:var(--ink2);font-style:italic;opacity:.7;margin-bottom:6px;}
        .bl-add{font-family:'DM Sans';font-weight:600;font-size:12px;cursor:pointer;border-radius:6px;padding:5px 11px;border:1.5px dashed var(--crust);background:transparent;color:var(--crust2);margin-top:2px;}
        .bl-add:hover{background:var(--paper2);}
        .bl-fixed{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px 10px;}
        .bl-fixed .cell label{display:block;font-size:9.5px;letter-spacing:.3px;color:var(--ink2);margin-bottom:3px;}
        .bl-fixed .cell .wrap{position:relative;}
        .bl-fixed .cell input{width:100%;font-family:'JetBrains Mono';font-size:13px;padding:5px 18px 5px 7px;border:1.5px solid var(--line);border-radius:5px;background:#fff;}
        .bl-fixed .cell .pc{position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:10px;color:var(--ink2);pointer-events:none;}
        .bl-typesum{margin-top:12px;font-size:11.5px;color:var(--ink2);line-height:1.5;border-top:1px dashed var(--line);padding-top:9px;}
        .bl-typesum b{font-family:'JetBrains Mono';color:var(--crust2);} .bl-warn{color:var(--alert);font-weight:600;}
        .bl-cap{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-top:16px;border-top:1.5px solid var(--line);padding-top:14px;}
        .bl-cap .bl-field{margin:0;width:190px;} .bl-cap .note{font-size:11px;color:var(--ink2);flex:1;min-width:160px;line-height:1.5;}
        .bl-mixwrap{overflow-x:auto;margin-top:16px;border:1.5px solid var(--line);border-radius:9px;}
        .bl-mixhead{font-family:'Fraunces',serif;font-weight:600;font-size:13px;padding:9px 12px;background:var(--paper2);border-bottom:1.5px solid var(--line);color:var(--crust2);}
        table.bl-mix{border-collapse:collapse;width:100%;font-size:12px;}
        table.bl-mix th,table.bl-mix td{padding:7px 10px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--line);}
        table.bl-mix th{font-family:'DM Sans';font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:var(--ink2);background:var(--paper2);font-weight:600;}
        table.bl-mix td{font-family:'JetBrains Mono';} table.bl-mix td.l,table.bl-mix th.l{text-align:left;}
        table.bl-mix tr td:first-child{font-weight:600;color:var(--crust2);}
        table.bl-mix tr.tot td{background:var(--paper);font-weight:600;border-top:1.5px solid var(--ink);}
        .bl-legend{display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:var(--ink2);margin-bottom:10px;align-items:center;}
        .bl-legend span{display:inline-flex;align-items:center;gap:6px;}
        .sw{width:16px;height:11px;border-radius:2px;} .sw.a{background:var(--active);} .sw.p{background:var(--passive);border:1px solid var(--passive-line);} .sw.x{background:repeating-linear-gradient(45deg,var(--alert),var(--alert) 3px,#fff 3px,#fff 6px);}
        .bl-hint{font-size:11px;color:var(--ink2);margin:0 0 10px;font-style:italic;}
        .bl-chart-wrap{overflow-x:auto;border:1.5px solid var(--line);border-radius:10px;background:var(--paper);padding:14px 0 8px;min-width:0;max-width:100%;}
        .bl-axis{position:relative;height:20px;margin-left:108px;} .bl-tick{position:absolute;top:0;font-family:'JetBrains Mono';font-size:10px;color:var(--ink2);transform:translateX(-50%);} .bl-tick::after{content:'';position:absolute;left:50%;top:15px;width:1px;height:6px;background:var(--line);}
        .bl-rowline{position:relative;height:42px;border-top:1px solid var(--line);}
        .bl-rowlabel{position:absolute;left:0;top:0;width:100px;height:100%;display:flex;flex-direction:column;justify-content:center;padding-left:4px;overflow:hidden;}
        .bl-rowlabel .b{font-family:'JetBrains Mono';font-size:11px;font-weight:600;color:var(--crust2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .bl-rowlabel .t{font-family:'JetBrains Mono';font-size:10px;color:var(--ink2);}
        .bl-track{position:absolute;left:108px;right:0;top:0;bottom:0;cursor:grab;} .bl-track.grabbing{cursor:grabbing;}
        .bl-gridcol{position:absolute;top:0;bottom:0;width:1px;background:var(--line);opacity:.5;}
        .bl-bar{position:absolute;top:8px;height:26px;border-radius:4px;display:flex;align-items:center;padding:0 6px;overflow:hidden;font-size:10.5px;white-space:nowrap;pointer-events:auto;cursor:grab;}
        .bl-track.grabbing .bl-bar{cursor:grabbing;}
        .bl-bar.p{background:var(--passive);border:1px solid var(--passive-line);color:var(--ink2);}
        .bl-bar.a{background:var(--active);color:#fff;font-weight:600;box-shadow:0 1px 3px rgba(140,74,20,.3);}
        .bl-bar.x{background:repeating-linear-gradient(45deg,var(--alert),var(--alert) 4px,#d9534f 4px,#d9534f 8px);color:#fff;font-weight:700;box-shadow:0 0 0 1.5px var(--alert);}
        .bl-tip{position:fixed;z-index:60;pointer-events:none;background:var(--ink);color:var(--paper);border-radius:8px;padding:8px 11px;box-shadow:0 6px 22px rgba(0,0,0,.3);transform:translate(12px,-118%);min-width:118px;}
        .bl-tip .b{font-family:'JetBrains Mono';font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--passive);} .bl-tip .n{font-family:'Fraunces',serif;font-weight:600;font-size:15px;margin:1px 0 3px;line-height:1.1;} .bl-tip .d{font-family:'JetBrains Mono';font-size:11px;color:#e7d3b1;} .bl-tip .x{font-family:'JetBrains Mono';font-size:10px;font-weight:600;color:#ffb3a7;margin-top:4px;}
        .bl-sched{margin-top:22px;} .bl-sched h3{font-family:'Fraunces',serif;font-size:16px;margin:0 0 4px;font-weight:600;} .bl-sched .sub{font-size:11px;color:var(--ink2);margin-bottom:12px;}
        .bl-list{display:flex;flex-direction:column;gap:2px;}
        .bl-item{display:grid;grid-template-columns:62px 1fr auto;gap:12px;align-items:center;padding:8px 12px;border-radius:7px;background:var(--paper);border:1px solid var(--line);}
        .bl-item.hit{border-color:var(--alert);background:var(--alert-bg);} .bl-item .tm{font-family:'JetBrains Mono';font-weight:600;font-size:14px;} .bl-item .lb{font-size:13px;} .bl-item .lb b{font-family:'JetBrains Mono';font-weight:600;color:var(--crust2);font-size:11px;} .bl-item .dn{font-family:'JetBrains Mono';font-size:11px;color:var(--ink2);} .bl-item .flag{font-size:10px;font-weight:700;color:var(--alert);}
        .bl-note{font-size:11px;color:var(--ink2);margin-top:10px;line-height:1.5;}
        .bl-tabs{position:sticky;top:0;z-index:90;background:var(--chrome);display:flex;gap:8px;margin:0 -22px 22px;padding:11px 18px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scroll-snap-type:x proximity;scrollbar-width:none;box-shadow:0 6px 18px -10px rgba(0,0,0,.5);transition:transform .25s ease;}
        .bl-tabs::-webkit-scrollbar{display:none;}
        .bl-tab{font-family:'DM Sans';font-weight:600;font-size:15px;letter-spacing:.2px;cursor:pointer;border:none;background:rgba(245,239,227,.08);color:var(--chrome-m);padding:11px 20px;border-radius:999px;display:flex;align-items:center;gap:7px;flex:0 0 auto;white-space:nowrap;scroll-snap-align:center;transition:background .15s,color .15s;}
        .bl-tab:hover{color:var(--chrome-t);background:rgba(245,239,227,.15);}
        .bl-tab.on{background:var(--crust);color:#fff;}
        .bl-tab .num{display:none;}
        .bl-tab .tlabel{display:none;}
        .bl-tab .tshort{display:inline;}
        .bl-mininav{display:none;}
        .bl-home{max-width:1100px;margin:0 auto;padding-top:28px;}
        .bl-home-hd{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:24px;padding-bottom:18px;border-bottom:1.5px solid var(--line);}
        .bl-newday{font-family:'DM Sans';font-size:14px;font-weight:600;color:var(--chrome-t);background:var(--chrome2);border:none;border-radius:9px;padding:11px 18px;cursor:pointer;white-space:nowrap;}
        .bl-newday:hover{background:var(--chrome);}
        .bl-daygrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;}
        .bl-daycard{position:relative;border:1.5px solid var(--line);border-radius:12px;background:var(--cream);padding:0;cursor:pointer;transition:border-color .15s,box-shadow .15s,transform .15s;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 2px 8px rgba(26,15,7,.04);}
        .bl-daycard:hover{border-color:var(--crust);box-shadow:0 6px 22px rgba(26,15,7,.12);transform:translateY(-2px);}
        .dc-band{background:var(--chrome2);padding:12px 14px 11px;}
        .dc-band .dc-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;}
        .dc-band .dc-date{font-family:'JetBrains Mono';font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--chrome-m);font-weight:600;}
        .dc-band .dc-acts{display:flex;gap:2px;}
        .dc-band .dc-acts button{width:26px;height:26px;border:none;background:transparent;border-radius:5px;color:var(--chrome-m);font-size:14px;cursor:pointer;line-height:1;}
        .dc-band .dc-acts button:hover{background:rgba(245,239,227,.12);color:var(--chrome-t);}
        .dc-band .dc-name{font-family:'Fraunces',serif;font-weight:600;font-size:18px;color:var(--chrome-t);line-height:1.15;}
        .dc-body{padding:10px 14px 13px;display:flex;flex-direction:column;gap:4px;}
        .dc-body .dc-sum{font-family:'JetBrains Mono';font-size:12px;color:var(--crust2);font-weight:600;}
        .dc-body .dc-recipes{font-size:13px;color:var(--ink2);line-height:1.35;}
        .dc-body .dc-bake{font-family:'JetBrains Mono';font-size:11px;color:var(--sand);}
        .dc-body .dc-open{margin-top:4px;font-family:'DM Sans';font-size:13px;font-weight:600;color:var(--crust);}
        .bl-dayhd{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;}
        .bl-back{display:inline-flex;align-items:center;justify-content:center;order:0;color:var(--crust2);background:#fff;border:1.5px solid var(--line);border-radius:8px;width:40px;height:40px;padding:0;cursor:pointer;flex:none;}
        .bl-back:hover{background:var(--paper2);color:var(--crust);}
        .bl-dayid{display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:1;min-width:0;}
        .bl-dayname{order:1;font-family:'Fraunces',serif;font-weight:600;font-size:24px;color:var(--chrome-t);background:transparent;border:none;border-bottom:1.5px solid transparent;padding:2px 2px;min-width:120px;flex:1;}
        .bl-dayname:hover{border-bottom-color:rgba(245,239,227,.25);} .bl-dayname:focus{outline:none;border-bottom-color:var(--crust);}
        .bl-dayname::placeholder{color:var(--chrome-m);}
        .bl-daydate{order:2;font-family:'JetBrains Mono';font-size:13px;color:var(--ink2);background:#fff;border:1.5px solid var(--line);border-radius:8px;padding:0 10px;height:40px;flex:none;}
        .bl-unittoggle-hd{order:3;}
        .bl-mininav.show{transform:translateY(0);}
        .bl-mininav button{font-family:'DM Sans';font-weight:600;font-size:12px;letter-spacing:.2px;color:var(--chrome-m);background:transparent;border:none;border-radius:7px;padding:7px 15px;cursor:pointer;}
        .bl-mininav button:hover{color:var(--chrome-t);}
        .bl-mininav button.on{background:var(--crust);color:var(--chrome-t);}
        .bl-builds{display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:14px;}
        .bl-build{border:1.5px solid var(--line);border-radius:12px;background:var(--cream);overflow:hidden;box-shadow:0 2px 8px rgba(26,15,7,.04);}
        .bl-build .bh{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:11px 14px;background:var(--chrome2);border-bottom:none;}
        .bl-build .bh .bn{font-family:'Fraunces',serif;font-weight:600;font-size:16px;color:var(--chrome-t);}
        .bl-build .bh .bt{font-family:'JetBrains Mono';font-size:11px;color:var(--chrome-m);font-weight:600;}
        .bl-build .meta{display:flex;gap:16px;padding:9px 13px;border-bottom:1px dashed var(--line);font-size:11px;color:var(--ink2);}
        .bl-build .meta b{font-family:'JetBrains Mono';color:var(--crust2);}
        .bl-build .ing{display:flex;justify-content:space-between;gap:10px;padding:6px 13px;font-size:13px;border-bottom:1px solid var(--paper2);}
        .bl-build .ing:last-child{border-bottom:none;}
        .bl-build .ing .nm{color:var(--ink);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .bl-build .ing .g{font-family:'JetBrains Mono';font-weight:600;color:var(--ink);flex:none;}
        .bl-build .ing.tot{background:var(--paper);font-weight:600;border-top:1.5px solid var(--ink);}
        .bl-build .ing.tot .nm{color:var(--crust2);}
        .bl-emptytab{text-align:center;padding:48px 20px;color:var(--ink2);font-size:13px;}
        .bl-shape{display:flex;gap:6px;}
        .shp{flex:1;font-family:'DM Sans';font-weight:600;font-size:13px;padding:8px;border:1.5px solid var(--line);border-radius:6px;background:#fff;color:var(--ink2);cursor:pointer;}
        .shp.on{background:var(--crust2);border-color:var(--crust2);color:var(--paper);}
        .bl-build{cursor:pointer;transition:box-shadow .12s,border-color .12s,opacity .12s;min-width:0;}
        .bl-build:hover{border-color:var(--crust);}
        .bl-build.active{grid-column:span 2;border-color:var(--crust);box-shadow:0 5px 18px rgba(140,74,20,.2);}
        .bl-build.active .bh .bn{font-size:23px;}
        .bl-build.active .ing{font-size:15px;padding:9px 16px;}
        .bl-build.active .meta{font-size:13px;padding:11px 16px;}
        .bl-build.done{opacity:.5;}
        .bl-build.done .bh{background:var(--line);}
        .bl-donebtn{display:block;width:100%;font-family:'DM Sans';font-weight:700;font-size:14px;padding:13px;border:none;background:var(--crust);color:var(--paper);cursor:pointer;}
        .bl-donebtn:hover{background:var(--crust2);}
        .bl-mixwater-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;}
        .bl-mixwater-btn{display:inline-flex;align-items:center;gap:8px;font-family:'DM Sans';font-weight:600;font-size:14px;color:var(--chrome-t);background:var(--chrome2);border:none;border-radius:10px;padding:11px 16px;cursor:pointer;}
        .bl-mixwater-btn:hover{background:var(--chrome);}
        .bl-mixwater-cur{display:inline-flex;align-items:center;gap:8px;font-family:'DM Sans';font-size:13px;color:var(--ink2);background:#eef4f6;border:1px solid #cfe0e6;border-radius:8px;padding:7px 8px 7px 12px;}
        .bl-mixwater-cur b{font-family:'JetBrains Mono';font-weight:700;color:#1f6f86;}
        .bl-mixwater-cur button{border:none;background:rgba(31,111,134,.12);color:#1f6f86;border-radius:6px;width:22px;height:22px;cursor:pointer;font-size:14px;line-height:1;}
        .bl-watertemp{font-style:normal;font-family:'JetBrains Mono';font-weight:700;color:#1f6f86;}
        .bl-modal-overlay{position:fixed;inset:0;z-index:200;background:rgba(26,15,7,.55);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);}
        .bl-modal{background:var(--cream);border-radius:16px;width:100%;max-width:440px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 70px -14px rgba(0,0,0,.55);}
        .dtc{padding:20px;}
        .dtc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px;}
        .dtc-head h3{font-family:'Fraunces',serif;font-weight:600;font-size:21px;color:var(--ink);margin:0;}
        .dtc-head p{font-size:12.5px;color:var(--ink2);margin:4px 0 0;line-height:1.4;}
        .dtc-close{flex:none;border:none;background:var(--paper2);color:var(--ink2);border-radius:8px;width:32px;height:32px;font-size:18px;line-height:1;cursor:pointer;}
        .dtc-close:hover{background:var(--line);}
        .dtc-grid{display:flex;flex-direction:column;gap:11px;margin-bottom:16px;}
        .dtc-field{display:flex;flex-direction:column;gap:5px;}
        .dtc-lbl{font-size:12.5px;font-weight:600;color:var(--ink2);}
        .dtc-inwrap{position:relative;display:flex;align-items:center;}
        .dtc-inwrap input{width:100%;font-family:'JetBrains Mono';font-size:16px;padding:10px 36px 10px 12px;border:1.5px solid var(--line);border-radius:9px;background:#fff;color:var(--ink);text-align:right;}
        .dtc-inwrap input:focus{outline:none;border-color:var(--crust);}
        .dtc-inwrap em{position:absolute;right:12px;font-style:normal;font-size:13px;color:var(--ink2);pointer-events:none;}
        .dtc-hint{font-size:11px;color:var(--sand);}
        .dtc-result{display:flex;flex-direction:column;align-items:center;gap:3px;padding:16px;border-radius:12px;background:linear-gradient(180deg,#eef4f6,#fffdf8);border:1.5px solid #cfe0e6;margin-bottom:16px;}
        .dtc-rlabel{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--ink2);font-weight:600;}
        .dtc-rval{font-family:'JetBrains Mono';font-weight:700;font-size:38px;line-height:1;color:#1f6f86;}
        .dtc-rformula{font-size:10.5px;color:var(--sand);font-family:'JetBrains Mono';margin-top:4px;text-align:center;}
        .dtc-apply{display:block;width:100%;font-family:'DM Sans';font-weight:700;font-size:15px;padding:14px;border:none;border-radius:10px;background:var(--crust);color:var(--paper);cursor:pointer;}
        .dtc-apply:hover{background:var(--crust2);}
        .bl-confirm{max-width:380px;padding:22px;}
        .bl-confirm h3{font-family:'Fraunces',serif;font-weight:600;font-size:20px;color:var(--ink);margin:0 0 8px;}
        .bl-confirm p{font-size:14px;color:var(--ink2);line-height:1.5;margin:0 0 20px;}
        .bl-confirm-acts{display:flex;gap:10px;}
        .bl-confirm-acts button{flex:1;font-family:'DM Sans';font-weight:700;font-size:14px;padding:12px;border-radius:9px;cursor:pointer;}
        .bl-confirm-cancel{border:1.5px solid var(--line);background:#fff;color:var(--ink2);}
        .bl-confirm-cancel:hover{background:var(--paper2);}
        .bl-confirm-del{border:none;background:var(--alert);color:#fff;}
        .bl-confirm-del:hover{background:#8f231c;}
        .bl-progress{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;font-size:12px;color:var(--ink2);}
        .bl-progress button{font-family:'DM Sans';font-size:11px;font-weight:600;border:1.5px solid var(--line);background:#fff;border-radius:6px;padding:5px 10px;cursor:pointer;color:var(--ink2);}
        .bl-progress button:hover{border-color:var(--crust);color:var(--crust2);}
        @media (max-width:560px){.bl-build.active{grid-column:1 / -1;}}
        .bl-rep-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(108px,1fr));gap:1px;background:var(--line);border:1.5px solid var(--line);border-radius:9px;overflow:hidden;margin-bottom:18px;}
        .bl-rep-stat{background:#fffdf8;padding:12px 14px;}
        .bl-rep-stat .v{font-family:'JetBrains Mono';font-size:18px;font-weight:600;color:var(--ink);}
        .bl-rep-stat .l{font-size:10px;letter-spacing:.8px;text-transform:uppercase;color:var(--ink2);margin-top:2px;}
        .bl-rep-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start;}
        .bl-rep-grid>*{min-width:0;}
        @media (max-width:760px){.bl-rep-grid{grid-template-columns:1fr;}}
        .bl-card{border:1.5px solid var(--line);border-radius:9px;overflow:hidden;background:#fffdf8;}
        .bl-card .ch{font-family:'Fraunces',serif;font-weight:600;font-size:14px;padding:10px 13px;background:var(--paper2);border-bottom:1.5px solid var(--line);color:var(--crust2);}
        .bl-line{display:flex;justify-content:space-between;gap:10px;padding:7px 13px;font-size:13px;border-bottom:1px solid var(--paper2);}
        .bl-line:last-child{border-bottom:none;}
        .bl-line .nm{color:var(--ink);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .bl-line .v{font-family:'JetBrains Mono';font-weight:600;color:var(--ink);flex:none;}
        .bl-line.cat{background:var(--paper);font-size:9.5px;letter-spacing:1px;text-transform:uppercase;color:var(--ink2);font-weight:600;padding:5px 13px;}
        .bl-line.hi{background:#fff4e6;} .bl-line.hi .v{color:var(--crust);}
        .bl-live-top{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:18px;}
        .bl-clock{font-family:'JetBrains Mono';font-weight:600;font-size:26px;color:var(--ink);}
        .bl-clock small{display:block;font-family:'DM Sans';font-size:11px;color:var(--ink2);font-weight:400;letter-spacing:.3px;margin-top:2px;}
        .bl-anchor{font-family:'DM Sans';font-weight:600;font-size:12px;border:1.5px solid var(--crust2);background:var(--crust2);color:var(--paper);border-radius:7px;padding:9px 14px;cursor:pointer;}
        .bl-anchor:hover{background:var(--crust);}
        .bl-hero{border:2px solid var(--crust);border-radius:11px;background:linear-gradient(180deg,#fff7ee,#fffdf8);padding:18px 20px;margin-bottom:16px;}
        .bl-hero.idle{border-color:var(--line);background:#fffdf8;}
        .bl-hero.now{background:linear-gradient(180deg,#fbe3d6,#fff7ee);}
        .bl-hero .lab{font-family:'JetBrains Mono';font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--crust2);font-weight:600;}
        .bl-hero .big{font-family:'Fraunces',serif;font-weight:700;font-size:25px;color:var(--ink);margin:6px 0 5px;line-height:1.12;}
        .bl-hero .when{font-family:'JetBrains Mono';font-size:14px;color:var(--ink2);}
        .bl-hero .when b{color:var(--crust);}
        .bl-sech{font-family:'Fraunces',serif;font-weight:600;font-size:14px;margin:0 0 10px;color:var(--ink);}
        .bl-then{display:flex;flex-direction:column;gap:2px;margin-bottom:18px;}
        .bl-then .row{display:grid;grid-template-columns:74px 1fr auto;gap:10px;align-items:center;padding:8px 12px;border-radius:7px;background:var(--paper);border:1px solid var(--line);}
        .bl-then .row.hit{border-color:var(--alert);background:var(--alert-bg);}
        .bl-then .cd{font-family:'JetBrains Mono';font-weight:600;font-size:13px;color:var(--crust2);}
        .bl-then .nm{font-size:13px;} .bl-then .nm b{font-family:'JetBrains Mono';font-size:11px;color:var(--crust2);}
        .bl-then .ck{font-family:'JetBrains Mono';font-size:11px;color:var(--ink2);}
        .bl-statgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(152px,1fr));gap:8px;}
        .bl-bstat{border:1.5px solid var(--line);border-radius:8px;padding:9px 11px;background:#fffdf8;}
        .bl-bstat .bn{font-family:'JetBrains Mono';font-size:11px;font-weight:600;color:var(--crust2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .bl-bstat .st{font-size:13px;color:var(--ink);margin-top:3px;}
        .bl-bstat .sub{font-size:10px;color:var(--ink2);font-family:'JetBrains Mono';margin-top:2px;}
        .bl-bstat.attn{border-color:var(--crust);background:#fff3e6;}
        .bl-bstat.idle{opacity:.5;} .bl-bstat.done{opacity:.55;}
        .bl-anchor.ghost{background:transparent;color:var(--crust2);}
        .bl-anchor.ghost:hover{background:var(--paper2);}
        .bl-livestatus{font-family:'DM Sans';font-size:14px;color:var(--ink);margin-bottom:14px;display:flex;align-items:center;gap:7px;}
        .bl-livestatus b{color:var(--crust2);}
        .bl-livestatus .dot{width:8px;height:8px;border-radius:50%;background:var(--alert);display:inline-block;}
        .lv-wrap{overflow-x:auto;overflow-y:hidden;border:1.5px solid var(--line);border-radius:10px;background:var(--paper);min-width:0;max-width:100%;-webkit-overflow-scrolling:touch;}
        .lv-inner{position:relative;}
        .lv-axis{position:relative;height:22px;border-bottom:1px solid var(--line);}
        .lv-tick{position:absolute;top:6px;font-family:'JetBrains Mono';font-size:10px;color:var(--ink2);transform:translateX(-50%);}
        .lv-tick::before{content:'';position:absolute;left:50%;top:-6px;width:1px;height:6px;background:var(--line);}
        .lv-row{position:relative;border-bottom:1px solid var(--paper2);}
        .lv-row:last-child{border-bottom:none;}
        .lv-label{position:sticky;left:0;z-index:5;width:96px;height:100%;display:flex;flex-direction:column;justify-content:center;padding-left:10px;background:var(--paper);box-shadow:6px 0 7px -4px rgba(42,29,18,.14);}
        .lv-label .b{font-family:'JetBrains Mono';font-size:11px;font-weight:600;color:var(--crust2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .lv-label .s{font-family:'JetBrains Mono';font-size:9px;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .lv-bar{position:absolute;top:16px;height:24px;border-radius:4px;display:flex;align-items:center;justify-content:center;overflow:hidden;}
        .lv-bar.a{background:var(--active);} .lv-bar.p{background:var(--passive);border:1px solid var(--passive-line);}
        .lv-lab.in{font-size:9.5px;font-weight:600;white-space:nowrap;padding:0 4px;}
        .lv-bar.a .lv-lab.in{color:#fff;} .lv-bar.p .lv-lab.in{color:var(--ink2);}
        .lv-lab.above{position:absolute;transform:translateX(-50%);font-size:9px;font-weight:600;white-space:nowrap;color:var(--crust2);pointer-events:none;z-index:2;}
        .lv-now{position:absolute;top:0;width:2px;background:var(--alert);z-index:3;pointer-events:none;}
        .lv-nowtag{position:absolute;top:0;left:50%;transform:translateX(-50%);background:var(--alert);color:#fff;font-family:'JetBrains Mono';font-size:9px;font-weight:600;padding:1px 5px;border-radius:0 0 5px 5px;white-space:nowrap;}
        .bl-livebtns{display:flex;gap:8px;flex-wrap:wrap;}
        .lv-screen.full{position:fixed;inset:0;z-index:100;margin:0;border:none;border-radius:0;background:var(--paper);padding:12px 14px 8px;display:flex;flex-direction:column;}
        .lv-screen.full .bl-note{display:none;}
        .lv-screen.full .bl-livestatus{margin-bottom:10px;}
        .lv-screen.full .lv-wrap{flex:1;min-height:0;overflow:auto;}
        .lv-row.recal{cursor:grab;touch-action:none;background:rgba(196,82,31,.05);}
        .lv-row.recal:active{cursor:grabbing;}
        .bl-recalhint{font-size:11.5px;color:var(--crust2);background:#fff4e6;border:1px solid #f0d6b0;border-radius:7px;padding:8px 11px;margin-bottom:12px;line-height:1.4;}
        .bl-cond{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px;padding-bottom:14px;border-bottom:1.5px solid var(--line);}
        .bl-unitwrap{display:flex;flex-direction:column;gap:5px;}
        .bl-unittoggle-hd{margin-left:auto;align-self:center;flex:none;height:38px;}
        .bl-unitwrap label{font-size:11px;color:var(--ink2);font-family:'DM Sans';}
        .bl-unittoggle{display:inline-flex;border:1.5px solid var(--line);border-radius:7px;overflow:hidden;height:38px;}
        .bl-unittoggle button{font-family:'JetBrains Mono';font-size:13px;font-weight:600;padding:0 13px;border:none;background:#fff;color:var(--ink2);cursor:pointer;}
        .bl-unittoggle button.on{background:var(--crust2);color:var(--paper);}
        .bl-inoccal{border:1.5px solid var(--line);border-radius:9px;background:#fffdf8;padding:12px 14px;margin-bottom:16px;}
        .bl-inoccal-hd{font-family:'JetBrains Mono';font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--crust2);font-weight:600;margin-bottom:10px;}
        .bl-inoccal-rows{display:flex;flex-direction:column;gap:8px;}
        .bl-inoccal .ic-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
        .bl-inoccal .ic-lab{font-family:'Fraunces',serif;font-weight:600;font-size:14px;color:var(--ink);width:54px;flex:none;}
        .bl-inoccal .ic-mid{font-size:12.5px;color:var(--ink2);}
        .bl-inoccal input{width:64px;font-family:'JetBrains Mono';font-size:15px;padding:7px 8px;border:1.5px solid var(--line);border-radius:7px;background:#fff;color:var(--ink);}
        .bl-inoccal .ic-derived{margin-top:10px;font-size:12.5px;line-height:1.4;color:var(--crust2);font-weight:600;}
        .bl-inoccal .ic-derived.est{color:var(--ink2);font-weight:400;font-style:italic;}
        .bl-feedmode{display:flex;flex-direction:column;gap:5px;}
        .bl-feedmode>label{font-size:11px;color:var(--ink2);font-family:'DM Sans';}
        .bl-calbtn{font-family:'DM Sans';font-size:13px;font-weight:600;height:38px;padding:0 14px;border:1.5px solid var(--line);border-radius:7px;background:#fff;color:var(--crust2);cursor:pointer;}
        .bl-calbtn.on{background:var(--crust2);color:var(--paper);border-color:var(--crust2);}
        .bl-feed em{font-style:normal;font-size:11px;color:var(--crust2);font-family:'JetBrains Mono';margin-top:2px;}
        .bl-feed em.autoref{color:var(--ink2);opacity:.75;}
        .bl-levcard.caution{border-color:#c9961f;}
        .bl-levcard .lcaution{font-size:11px;color:#8a6a14;background:#fbf2da;padding:8px 13px;line-height:1.4;}
        .bl-levcard.retarded{border-color:#3a6ea5;}
        .bl-levcard.retarded .lwater{background:linear-gradient(180deg,#e7eff5,#fffdf8);}
        .bl-levcard.retarded .lwater .wt{color:#2f6090;}
        .lretard{margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--ink2);font-family:'DM Sans';cursor:pointer;white-space:nowrap;}
        .lretard input{width:15px;height:15px;accent-color:#3a6ea5;cursor:pointer;}
        .bl-levcard .lrow.retardrow{color:#2f6090;}
        .bl-levcard .lrow.retardrow b,.bl-levcard .lrow.retardrow em{color:#2f6090;font-style:normal;}
        .bl-levcard .lretardnote{font-size:11px;color:#2f6090;background:#eaf1f8;padding:8px 13px;line-height:1.4;}
        .bl-cond .bl-field2{width:150px;}
        .bl-feed{margin-left:auto;font-family:'DM Sans';font-size:13px;color:var(--ink2);display:flex;flex-direction:column;align-items:flex-end;}
        .bl-feed b{font-family:'JetBrains Mono';font-size:22px;font-weight:600;color:var(--crust);}
        .bl-levparams{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px;}
        .bl-levread{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;padding:8px 12px;background:var(--paper);border:1px solid var(--line);border-radius:8px;margin-bottom:8px;}
        .bl-levread .lr-nm{font-family:'Fraunces',serif;font-weight:600;font-size:15px;color:var(--ink);}
        .bl-levread .lr-spec{font-family:'JetBrains Mono';font-size:11.5px;color:var(--crust2);font-weight:600;}
        .bl-levread .lr-exp{font-size:11px;color:var(--ink2);font-style:italic;}
        .bl-levparams .nm{font-family:'Fraunces',serif;font-weight:600;font-size:14px;color:var(--ink);width:90px;flex:none;padding-bottom:6px;}
        .bl-levparams .bl-field2{width:96px;}
        .bl-levbuilds{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;margin-top:16px;}
        /* Food safety — matrix: rows = fridges/stations, 3 reading columns */
        .bl-fsmatrix{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1.5px solid var(--line);border-radius:11px;background:var(--cream);margin-bottom:12px;box-shadow:0 2px 8px rgba(26,15,7,.04);}
        .fsm-head,.fsm-row{display:grid;grid-template-columns:minmax(132px,1.1fr) repeat(3,minmax(112px,1fr));min-width:520px;}
        .fsm-head{background:var(--chrome2);}
        .fsm-head span{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--chrome-m);font-weight:600;padding:10px 11px;}
        .fsm-head .fsm-rl{color:var(--chrome-t);}
        .fsm-row{border-top:1px solid var(--line);}
        .fsm-row .fsm-rl{display:flex;flex-direction:column;gap:2px;justify-content:center;padding:9px 11px;border-right:1px solid var(--line);position:relative;}
        .fsm-name{font-family:'Fraunces',serif;font-weight:600;font-size:15px;color:var(--ink);background:transparent;border:none;border-bottom:1.5px solid transparent;padding:1px 0;width:100%;}
        .fsm-name:focus{outline:none;border-bottom-color:var(--crust);}
        .fsm-name::placeholder{color:var(--ink2);}
        .fsm-sub{font-family:'JetBrains Mono';font-size:9px;letter-spacing:.3px;text-transform:uppercase;color:var(--sand);font-weight:600;}
        .fsm-rl .ing-x{position:absolute;top:5px;right:5px;width:24px;height:24px;font-size:14px;}
        .fsm-cell{display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 8px;border-right:1px solid var(--line);}
        .fsm-cell:last-child{border-right:none;}
        .fsm-cell.ok{background:#f1f7ec;}
        .fsm-cell.bad{background:#fdf3f1;}
        .fsm-input{display:flex;align-items:center;gap:3px;}
        .fsm-input input{width:62px;font-family:'JetBrains Mono';font-size:15px;font-weight:600;padding:6px 7px;border:1.5px solid var(--line);border-radius:7px;text-align:right;background:#fff;color:var(--ink);}
        .fsm-input span{font-size:11px;color:var(--ink2);}
        .fsm-meta{display:flex;align-items:center;gap:7px;min-height:18px;}
        .fsm-ts{font-family:'JetBrains Mono';font-size:11px;color:var(--crust2);background:transparent;border:none;cursor:pointer;padding:1px 5px;border-radius:5px;font-weight:600;}
        .fsm-ts:hover{background:var(--paper2);}
        .fsm-ts.none{color:var(--ink2);opacity:.45;cursor:default;}
        .fsm-flag{font-family:'DM Sans';font-size:11px;font-weight:700;}
        .fsm-flag.ok{color:#3f7a2e;}
        .fsm-flag.bad{color:var(--alert);}
        /* Levain Gantt */
        .bl-lev-gantt{margin-top:18px;background:var(--chrome2);border-radius:12px;padding:16px 16px 12px;}
        .lg-title{font-family:'Fraunces',serif;font-weight:600;font-size:16px;color:var(--chrome-t);margin-bottom:14px;display:flex;align-items:center;gap:8px;}
        .lg-title::before{content:'◆';font-size:8px;color:var(--crust);}
        .lg-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;}
        .lg-inner{min-width:520px;position:relative;}
        .lg-axis{position:relative;height:18px;margin-left:96px;border-bottom:1px solid rgba(245,239,227,.14);}
        .lg-tick{position:absolute;top:0;transform:translateX(-50%);font-family:'JetBrains Mono';font-size:9px;color:var(--chrome-m);}
        .lg-tick::after{content:'';position:absolute;top:14px;left:50%;width:1px;height:6px;background:rgba(245,239,227,.14);}
        .lg-row{display:flex;align-items:center;height:46px;}
        .lg-rowlabel{width:96px;flex:none;display:flex;flex-direction:column;line-height:1.2;padding-right:8px;}
        .lg-rowlabel b{font-family:'Fraunces',serif;font-size:13px;color:var(--chrome-t);font-weight:600;}
        .lg-rowlabel span{font-family:'JetBrains Mono';font-size:9px;color:var(--chrome-m);}
        .lg-track{position:relative;flex:1;height:100%;}
        .lg-bar{position:absolute;top:50%;transform:translateY(-50%);height:13px;border-radius:3px;}
        .lg-bar.build{background:linear-gradient(90deg,#8a4a14,var(--crust));}
        .lg-bar.retard{background:repeating-linear-gradient(45deg,#2f6090,#2f6090 5px,#3a6ea5 5px,#3a6ea5 10px);}
        .lg-mark{position:absolute;top:0;height:100%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;justify-content:center;}
        .lg-mark .lg-dot{width:8px;height:8px;border-radius:50%;border:1.5px solid var(--chrome2);}
        .lg-mark.feed .lg-dot{background:var(--chrome-m);}
        .lg-mark.peak .lg-dot{background:#f0c000;}
        .lg-mark.mix .lg-dot{background:var(--crust);}
        .lg-mlab{position:absolute;top:-2px;font-family:'JetBrains Mono';font-size:8.5px;color:var(--chrome-m);white-space:nowrap;transform:translateX(-50%);}
        .lg-mark.feed .lg-mlab{left:50%;}
        .lg-mark.peak .lg-mlab{top:auto;bottom:-2px;left:50%;color:#e8c44a;}
        .lg-mark.mix .lg-mlab{left:50%;color:var(--crust);}
        .lg-legend{display:flex;gap:14px;margin-top:8px;margin-left:96px;}
        .lg-key{font-family:'DM Sans';font-size:10px;color:var(--chrome-m);display:flex;align-items:center;gap:5px;}
        .lg-key.build::before{content:'';width:14px;height:8px;border-radius:2px;background:var(--crust);}
        .lg-key.retard::before{content:'';width:14px;height:8px;border-radius:2px;background:repeating-linear-gradient(45deg,#2f6090,#2f6090 3px,#3a6ea5 3px,#3a6ea5 6px);}
        .lg-key.peakk{color:#e8c44a;}
        /* Bake Gantt */
        .bl-bake-gantt{margin:10px 14px 4px;background:var(--chrome2);border-radius:10px;padding:14px 14px 10px;}
        .bg-axis{position:relative;height:16px;margin-left:84px;border-bottom:1px solid rgba(245,239,227,.14);margin-bottom:4px;}
        .bg-tick{position:absolute;top:0;transform:translateX(-50%);font-family:'JetBrains Mono';font-size:9px;color:var(--chrome-m);}
        .bg-tick::after{content:'';position:absolute;top:12px;left:50%;width:1px;height:5px;background:rgba(245,239,227,.14);}
        .bg-preheat{position:absolute;height:9px;margin-top:2px;background:repeating-linear-gradient(45deg,rgba(176,144,112,.3),rgba(176,144,112,.3) 4px,transparent 4px,transparent 8px);border-radius:2px;margin-left:84px;display:none;}
        .bg-row{display:flex;align-items:center;height:30px;}
        .bg-rowlabel{width:84px;flex:none;display:flex;flex-direction:column;line-height:1.15;padding-right:8px;}
        .bg-rowlabel b{font-family:'Fraunces',serif;font-size:12px;color:var(--chrome-t);font-weight:600;}
        .bg-rowlabel span{font-family:'JetBrains Mono';font-size:9px;color:var(--chrome-m);}
        .bg-track{position:relative;flex:1;height:100%;}
        .bg-bar{position:absolute;top:50%;transform:translateY(-50%);height:13px;}
        .bg-bar.steam{background:repeating-linear-gradient(45deg,#5a86a8,#5a86a8 4px,#6f97b5 4px,#6f97b5 8px);border-radius:3px 0 0 3px;}
        .bg-bar.dry{background:linear-gradient(90deg,var(--crust),#8a4a14);border-radius:0 3px 3px 0;}
        .bg-vent{position:absolute;top:50%;transform:translateY(-50%);width:2px;height:18px;background:var(--chrome-t);}
        .bg-legend{display:flex;gap:14px;margin-top:8px;margin-left:84px;}
        .bg-key{font-family:'DM Sans';font-size:10px;color:var(--chrome-m);display:flex;align-items:center;gap:5px;}
        .bg-key.steam::before{content:'';width:14px;height:8px;border-radius:2px;background:repeating-linear-gradient(45deg,#5a86a8,#5a86a8 3px,#6f97b5 3px,#6f97b5 6px);}
        .bg-key.dry::before{content:'';width:14px;height:8px;border-radius:2px;background:var(--crust);}
        .bl-levcard{border:1.5px solid var(--line);border-radius:12px;overflow:hidden;background:var(--cream);min-width:0;box-shadow:0 2px 8px rgba(26,15,7,.04);}
        .bl-levcard.warn{border-color:var(--alert);}
        .bl-levcard .lh{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:11px 14px;background:var(--chrome2);border-bottom:none;}
        .bl-levcard .lh .nm{font-family:'Fraunces',serif;font-weight:600;font-size:15px;color:var(--chrome-t);}
        .bl-levcard .lh .sv{font-family:'JetBrains Mono';font-size:10px;color:var(--chrome-m);font-weight:600;}
        .bl-levcard .lwater{display:flex;flex-direction:column;align-items:center;padding:14px 8px 12px;background:linear-gradient(180deg,#eef4f6,#fffdf8);border-bottom:1px dashed var(--line);}
        .bl-levcard .lwater .wt{font-family:'JetBrains Mono';font-weight:700;font-size:30px;color:#1f6f86;line-height:1;}
        .bl-levcard .lwater .wl{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--ink2);margin-top:4px;}
        .bl-levcard.warn .lwater{background:var(--alert-bg);} .bl-levcard.warn .lwater .wt{color:var(--alert);}
        .bl-levcard .lrows{padding:4px 0;border-bottom:1px dashed var(--line);}
        .bl-levcard .lrow{display:flex;justify-content:space-between;gap:8px;padding:5px 13px;font-size:12px;color:var(--ink2);}
        .bl-levcard .lrow b{font-family:'JetBrains Mono';color:var(--crust2);font-weight:600;}
        .bl-levcard .lrow em{font-style:normal;color:var(--ink2);font-family:'JetBrains Mono';font-size:11px;}
        .bl-levcard .lmix{padding:4px 0;}
        .bl-levcard .ing{display:flex;justify-content:space-between;gap:10px;padding:6px 13px;font-size:13px;}
        .bl-levcard .ing span:last-child{font-family:'JetBrains Mono';font-weight:600;}
        .bl-levcard .ing.tot{background:var(--paper);font-weight:600;border-top:1.5px solid var(--ink);color:var(--crust2);}
        .bl-levcard .lwarn{font-size:11px;color:var(--alert);background:var(--alert-bg);padding:8px 13px;line-height:1.4;}
        @media (max-width:600px){
          .bl-root{padding:0 12px 34px;}
          .bl-head{margin:0 -12px;padding:12px 12px 0;}
          .bl-tabs{margin:0 -12px 20px;padding:11px 14px;}
          .bl-title{font-size:20px;} .bl-title small{font-size:9px;letter-spacing:1.8px;} .bl-hap-logo{height:33px;} .bl-prodname{font-size:21px;}
          .bl-hap-logo-sm{height:32px;} .bl-prodname-sm{font-size:20px;}
          .bl-panel{padding:13px;}
          /* 16px inputs stop iOS zoom-on-tap; taller targets for fingers */
          .bl-root input, .bl-root select{font-size:16px;min-height:40px;}
          .ing-pct.main{min-height:40px;}
          .bl-tab{padding:12px 20px;font-size:15px;}
          /* sticky nav slides up out of the way on scroll-down, returns on scroll-up */
          .bl-tabs.navhidden{transform:translateY(-100%);}
          /* day name drops to its own full-width row; home + date + units align above it */
          .bl-dayname{order:5;flex:1 0 100%;font-size:21px;min-width:0;}
          /* home header: stack so the toggle + new-day button never clip */
          .bl-home-hd{flex-direction:column;align-items:stretch;gap:14px;}
          .bl-home-tabs{display:flex;width:100%;}
          .bl-home-tabs button{flex:1;text-align:center;padding:12px 8px;font-size:15px;}
          .bl-newday{width:100%;padding:13px 18px;font-size:15px;}
          /* food safety: narrower columns so two readings show before scroll */
          .fsm-head,.fsm-row{grid-template-columns:minmax(104px,1fr) repeat(3,minmax(96px,1fr));min-width:440px;}
          /* lift the smallest labels off the floor for scannability */
          .bl-subhead{font-size:11.5px;}
          .bl-note{font-size:13px;}
          .lr-spec,.dc-bake,.dc-date{font-size:12px;}
          .ing-pct.main b{font-size:8.5px;}
          .fsm-sub{font-size:10px;}
          .fsm-ts{font-size:12px;}
          .bl-field2 label{font-size:11.5px;}
          .bl-fixed .cell label{font-size:11px;}
          .bl-lev-exp label,.bl-lev-grid label{font-size:11px;}
          .bl-rec-top{grid-template-columns:1fr 1fr;}
          .bl-rec-top > div:first-child{grid-column:1 / -1;}
          .ing-x{width:38px;height:40px;font-size:17px;}
          .bl-rep-grid{grid-template-columns:1fr;}
          .bl-hero .big{font-size:21px;} .bl-clock{font-size:23px;}
          .bl-types{gap:14px;}
        }

        /* ---- mix toolbar alt button + label generator ---- */
        .bl-mixwater-btn.alt{background:#2a3c44;}
        .bl-mixwater-btn.alt:hover{background:#1f2d33;}
        .bl-mixwater-btn:disabled{opacity:.45;cursor:not-allowed;}
        .label-print-overlay{position:fixed;inset:0;z-index:300;background:#241811;overflow:auto;}
        .label-print-ui{position:sticky;top:0;z-index:3;display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:13px 18px;background:#1a0f07;color:#f5efe3;font-family:'DM Sans',sans-serif;}
        .label-print-ui .lpu-title{font-family:'Fraunces',serif;font-weight:600;font-size:18px;display:flex;flex-direction:column;line-height:1.15;}
        .label-print-ui .lpu-title small{font-family:'DM Sans';font-weight:500;font-size:11px;color:#b09070;}
        .lpu-ctl{display:flex;align-items:center;gap:7px;font-size:12px;color:#b09070;font-weight:600;}
        .lpu-ctl select{font-family:'DM Sans';font-size:13px;padding:8px 10px;border-radius:8px;border:1.5px solid rgba(245,239,227,.18);background:#2f1c0f;color:#f5efe3;cursor:pointer;}
        .lpu-ctl.sm input{width:58px;font-family:'JetBrains Mono';font-size:13px;padding:7px 8px;border-radius:7px;border:1.5px solid rgba(245,239,227,.18);background:#2f1c0f;color:#f5efe3;text-align:right;}
        .lpu-ctl.sm em{font-style:normal;font-size:11px;}
        .lpu-spacer{flex:1;}
        .lpu-print{font-family:'DM Sans';font-weight:700;font-size:14px;padding:11px 18px;border:none;border-radius:9px;background:#b5651d;color:#fff;cursor:pointer;}
        .lpu-print:hover{background:#8a4a14;}
        .lpu-close{flex:none;border:none;background:rgba(245,239,227,.12);color:#f5efe3;border-radius:8px;width:36px;height:36px;font-size:19px;line-height:1;cursor:pointer;}
        .label-print-hint{font-family:'DM Sans';font-size:12px;color:#d8c4a8;background:#2f1c0f;padding:9px 18px;line-height:1.45;}
        .label-print-hint b{color:#f5efe3;}
        .label-stage{display:flex;justify-content:center;padding:24px 12px 48px;zoom:.62;}
        .label-sheets{display:flex;flex-direction:column;gap:22px;}
        .label-sheet{background:#fff;box-shadow:0 6px 30px rgba(0,0,0,.45);}
        .label-cell{box-sizing:border-box;width:100%;height:100%;overflow:hidden;padding:0.13in 0.16in;display:flex;flex-direction:row;gap:0.16in;color:#1a1a1a;font-family:'DM Sans',sans-serif;}
        .lc-left{flex:none;width:1.55in;display:flex;flex-direction:column;justify-content:center;border-right:1pt solid #1a1a1a;padding-right:0.14in;overflow:hidden;}
        .lc-left .lc-n{font-family:'JetBrains Mono';font-weight:700;font-size:11pt;color:#fff;background:#1a1a1a;border-radius:3pt;padding:1.5pt 6pt;align-self:flex-start;margin-bottom:5pt;letter-spacing:.5pt;}
        .lc-left .lc-name{font-family:'Fraunces',serif;font-weight:600;font-size:17pt;line-height:1.04;}
        .lc-right{flex:1;display:flex;flex-direction:column;min-width:0;}
        .lc-lines{flex:1;display:flex;flex-direction:column;gap:1pt;justify-content:center;}
        .lc-line{display:flex;justify-content:space-between;align-items:baseline;gap:6pt;font-size:9pt;line-height:1.3;}
        .lc-line .lc-ing{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
        .lc-line .lc-g{font-family:'JetBrains Mono';font-weight:700;flex:none;}
        .lc-foot{font-size:7pt;color:#555;border-top:0.5pt solid #ccc;padding-top:2pt;margin-top:3pt;}
        @media (max-width:600px){ .label-stage{zoom:.42;} .label-print-ui{gap:9px;padding:11px 12px;} .lpu-spacer{flex-basis:100%;height:0;} }
        @media print {
          @page { size: 8.5in 11in; margin: 0; }
          html, body { background:#fff !important; }
          .bl-root { display: none !important; }
          .label-print-overlay { position: static !important; inset:auto !important; background:#fff !important; overflow:visible !important; }
          .label-print-ui, .label-print-hint { display: none !important; }
          .label-stage { zoom:1 !important; padding:0 !important; display:block !important; }
          .label-sheets { gap:0 !important; display:block !important; }
          .label-sheet { box-shadow:none !important; margin:0 !important; break-after:page; page-break-after:always; }
          .label-sheet:last-child { break-after:auto; page-break-after:auto; }
        }
      `}</style>

      {view === "home" && (
        <div className="bl-home">
          <div className="bl-home-hd">
            <div className="bl-title"><HapLogo className="bl-hap-logo" /><span className="bl-prodname">BakeLab</span><small>production studio</small></div>
            <div className="bl-home-tabs">
              <button className={homeTab === "bakedays" ? "on" : ""} onClick={() => setHomeTab("bakedays")}>Bake days</button>
              <button className={homeTab === "recipes" ? "on" : ""} onClick={() => { setHomeTab("recipes"); setBuilderView("list"); }}>Recipes</button>
              <button className={homeTab === "starter" ? "on" : ""} onClick={() => setHomeTab("starter")}>Starter</button>
            </div>
            {homeTab === "bakedays" && <button className="bl-newday" onClick={newDay}>+ New bake day</button>}
            {homeTab === "recipes" && builderView === "list" && <button className="bl-newday" onClick={openNewCore}>+ New recipe</button>}
          </div>

          {homeTab === "bakedays" && (<>
          {days.length === 0 ? (
            <div className="bl-emptytab">No bake days yet — create your first.</div>
          ) : (
            <div className="bl-daygrid">
              {[...days].sort((a, b) => ((b.date || "").localeCompare(a.date || "")) || ((b.updatedAt || 0) - (a.updatedAt || 0))).map((d) => {
                const sl = Array.isArray(d.day && d.day.slots) ? d.day.slots : [];
                const active = sl.filter((s) => (s.loaves || 0) > 0);
                const loaves = active.reduce((a, s) => a + (s.loaves || 0), 0);
                const names = active.map((s) => (s.draft && s.draft.name) || "—").join(" · ");
                const sess = Array.isArray(d.day && d.day.slots) ? d.day.slots.flatMap((s) => (s.sessions || [])) : [];
                const bakeDates = [...new Set(sess.map((s) => s.date).filter(Boolean))].sort();
                const bakeLine = bakeDates.length ? (bakeDates.length === 1 ? ("bake " + bakeDates[0]) : (bakeDates.length + " bake dates · " + bakeDates.map((d) => d.slice(5)).join(", "))) : "";
                return (
                  <div className="bl-daycard" key={d.id} onClick={() => openDay(d.id)}>
                    <div className="dc-band">
                      <div className="dc-top">
                        <span className="dc-date">{d.date || "—"}</span>
                        <div className="dc-acts">
                          <button title="Duplicate" onClick={(e) => { e.stopPropagation(); dupDay(d.id); }}>⧉</button>
                          <button title="Delete" onClick={(e) => { e.stopPropagation(); setDelTarget({ id: d.id, name: d.name, kind: "day" }); }}>×</button>
                        </div>
                      </div>
                      <div className="dc-name">{d.name || "Untitled"}</div>
                    </div>
                    <div className="dc-body">
                      <div className="dc-sum">{active.length ? (active.length + (active.length === 1 ? " recipe · " : " recipes · ") + loaves + " loaves") : "empty"}</div>
                      <div className="dc-recipes">{names || "No recipes set yet"}</div>
                      {bakeLine && <div className="dc-bake">{bakeLine}</div>}
                      <div className="dc-open">Open →</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="bl-note">Each bake day saves its own recipes, loaf counts, schedule, temperatures and levain feed plan. Your recipe library and starter settings are shared across every day.</div>
          </>)}

          {homeTab === "recipes" && (<>
          {builderView === "edit" && editingDraft ? (
            <div className="bl-recipe-editor">
              <div className="bl-re-hd">
                <button className="bl-back" onClick={cancelEdit} title="Back to recipes"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
                <span className="bl-re-title">{editingIsRemix ? "Remix" : (editingRecipeId ? "Edit core recipe" : "New core recipe")}</span>
                <button className="bl-newday" style={{marginLeft:"auto"}} onClick={saveEdit}>Save</button>
              </div>
              <div className="bl-re-form">
                <div className="bl-field"><label>Recipe name</label><BufferedInput className="bl-re-name-input" value={editingDraft.name || ""} onCommit={(v) => patchEdit({ name: v })} placeholder="Name this recipe" /></div>
                <div className="bl-re-row">
                  <div className="bl-field2"><label>Loaf weight (g)</label><input type="number" min="0" value={editingDraft.loafWeight || 850} onChange={(e) => patchEdit({ loafWeight: Math.max(0, Number(e.target.value) || 0) })} /></div>
                  <div className="bl-field2"><label>Autolyse (min)</label><input type="number" min="0" value={editingDraft.autolyse ?? 45} onChange={(e) => patchEdit({ autolyse: Math.max(0, Number(e.target.value) || 0) })} /></div>
                  <div className="bl-field2"><label>Shape</label><select value={editingDraft.shape || "round"} onChange={(e) => patchEdit({ shape: e.target.value })}><option value="round">Round</option><option value="oval">Oval</option></select></div>
                </div>
                <div className="bl-subhead">Flours · main balances to 100%</div>
                {(editingDraft.flours || []).map((f, idx) => (
                  <div className="ing-row" key={f.id}>
                    <IngredientInput className="ing-name" value={f.name} onCommit={(v) => patchEditFlour(idx, { name: v })} placeholder={"Flour " + (idx + 1)} ingredients={ingredients} />
                    {idx === 0
                      ? <div className="ing-pct main"><b>main</b><span>{Math.max(0, 100 - (editingDraft.flours.slice(1).reduce((a, x) => a + (+x.pct || 0), 0)))}</span><em>%</em></div>
                      : <div className="ing-pct"><input type="number" min="0" value={f.pct} onChange={(e) => patchEditFlour(idx, { pct: Math.max(0, Number(e.target.value) || 0) })} /><em>%</em></div>}
                    {idx === 0 ? <span className="ing-x ph" /> : <button className="ing-x" onClick={() => removeEditFlour(idx)}>×</button>}
                  </div>
                ))}
                <button className="bl-add" onClick={addEditFlour}>+ Flour</button>
                <div className="bl-subhead">Water · Salt · Levain</div>
                <div className="bl-re-row">
                  <div className="bl-field2"><label>Water %</label><input type="number" min="0" value={editingDraft.water || 0} onChange={(e) => patchEdit({ water: Math.max(0, Number(e.target.value) || 0) })} /></div>
                  <div className="bl-field2"><label>Salt %</label><input type="number" min="0" value={editingDraft.salt || 0} onChange={(e) => patchEdit({ salt: Math.max(0, Number(e.target.value) || 0) })} /></div>
                  <div className="bl-field2"><label>Levain %</label><input type="number" min="0" value={editingDraft.levain || 0} onChange={(e) => patchEdit({ levain: Math.max(0, Number(e.target.value) || 0) })} /></div>
                </div>
                <div className="bl-subhead">Inclusions</div>
                {(editingDraft.inclusions || []).map((f, idx) => (
                  <div className="ing-row" key={f.id}>
                    <IngredientInput className="ing-name" value={f.name} onCommit={(v) => patchEditInc(idx, { name: v })} placeholder={"Inclusion " + (idx + 1)} ingredients={ingredients} kind="inclusion" />
                    <div className="ing-pct"><input type="number" min="0" value={f.pct} onChange={(e) => patchEditInc(idx, { pct: Math.max(0, Number(e.target.value) || 0) })} /><em>%</em></div>
                    <button className="ing-x" onClick={() => removeEditInc(idx)}>×</button>
                  </div>
                ))}
                <button className="bl-add" onClick={addEditInc}>+ Inclusion</button>
                <div className="bl-subhead">Bake</div>
                <div className="bl-re-row">
                  <div className="bl-field2"><label>Temp (°{tempUnit})</label><input type="number" value={Math.round(cToU(editingDraft.bakeTemp ?? 245))} onChange={(e) => patchEdit({ bakeTemp: uToC(Number(e.target.value) || 0) })} /></div>
                  <div className="bl-field2"><label>Bake time (min)</label><input type="number" min="1" value={editingDraft.bakeMin ?? 45} onChange={(e) => patchEdit({ bakeMin: Math.max(1, Number(e.target.value) || 0) })} /></div>
                  <div className="bl-field2"><label>Steam (min)</label><input type="number" min="0" value={editingDraft.steamMin ?? 20} onChange={(e) => patchEdit({ steamMin: Math.max(0, Number(e.target.value) || 0) })} /></div>
                </div>
                <div className="bl-subhead">Levain build</div>
                <div className="bl-re-row">
                  <div className="bl-field2"><label>Hydration %</label><input type="number" min="0" value={editingDraft.levHyd ?? 100} onChange={(e) => patchEdit({ levHyd: Math.max(0, Number(e.target.value) || 0) })} /></div>
                  <div className="bl-field2"><label>Inoculation %</label><input type="number" min="0" value={editingDraft.levInoc ?? 10} onChange={(e) => patchEdit({ levInoc: Math.max(0, Number(e.target.value) || 0) })} /></div>
                  <div className="bl-field2"><label>Build to peak (h)</label><input type="number" min="0" step="0.25" value={editingDraft.levBuildHrs ?? 5} onChange={(e) => patchEdit({ levBuildHrs: Math.max(0, Number(e.target.value) || 0) })} /></div>
                  <div className="bl-field2"><label>Ref temp (°{tempUnit})</label><input type="number" value={Math.round(cToU(editingDraft.levRefTemp ?? 24))} onChange={(e) => patchEdit({ levRefTemp: uToC(Number(e.target.value) || 0) })} /></div>
                </div>
                {editingIsRemix && <button className="bl-promote-btn" onClick={() => { promoteRemixToCore(editingRecipeId); setBuilderView("list"); }}>↑ Save as core recipe</button>}
              </div>
            </div>
          ) : (
            <div className="bl-builder-list">
              <div className="bl-subhead bl-builder-sh">Core recipes</div>
              {coreRecipes.length === 0 && <div className="bl-emptytab">No core recipes yet — create one above.</div>}
              <div className="bl-recipe-grid">
                {coreRecipes.map((r) => (
                  <div className="bl-recipe-card" key={r.id} onClick={() => openEditCore(r.id)}>
                    <div className="brc-band">
                      <div className="brc-name">{r.name}</div>
                      <button className="brc-del" title="Delete" onClick={(e) => { e.stopPropagation(); setDelTarget({ id: r.id, name: r.name, kind: "core" }); }}>×</button>
                    </div>
                    <div className="brc-body">
                      <div className="brc-meta">{r.flours && r.flours.map((f, i) => (i === 0 ? `${Math.max(0, 100 - (r.flours.slice(1).reduce((a, x) => a + (+x.pct || 0), 0)))}% ${f.name}` : `${f.pct}% ${f.name}`)).join(" · ")}</div>
                      <div className="brc-meta">{r.loafWeight}g · {r.water}% water · {r.levain}% levain</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bl-subhead bl-builder-sh">Remixes</div>
              {remixes.length === 0 && <div className="bl-emptytab" style={{marginBottom:8}}>No remixes yet — adjust a recipe on a bake day and hit Remix →</div>}
              <div className="bl-recipe-grid">
                {remixes.map((r) => (
                  <div className="bl-recipe-card remix" key={r.id} onClick={() => openEditRemix(r.id)}>
                    <div className="brc-band">
                      <div className="brc-name">{r.name}</div>
                      <button className="brc-del" onClick={(e) => { e.stopPropagation(); setDelTarget({ id: r.id, name: r.name, kind: "remix" }); }}>×</button>
                    </div>
                    <div className="brc-body">
                      <div className="brc-meta">{r.loafWeight}g · {r.water}% water · {r.levain}% levain</div>
                      <div className="brc-acts">
                        <button className="brc-promote" onClick={(e) => { e.stopPropagation(); promoteRemixToCore(r.id); }}>↑ Core</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bl-subhead bl-builder-sh">Ingredients</div>
              <div className="bl-ing-manager">
                <div className="bl-ing-list">
                  {ingredients.length === 0 && <div className="bl-emptytab">No saved ingredients yet.</div>}
                  {ingredients.map((i) => (
                    <div className="bl-ing-row" key={i.id}>
                      <span className="ir-name">{i.name}</span>
                      {i.price != null && <span className="ir-price">${i.price}</span>}
                      <button className={"ir-kind " + ((i.kind || "flour") === "inclusion" ? "inc" : "flr")} title="Tap to switch flour / inclusion" onClick={() => toggleIngredientKind(i.id)}>{(i.kind || "flour") === "inclusion" ? "inclusion" : "flour"}</button>
                      <button className="ing-x" onClick={() => deleteIngredient(i.id)}>×</button>
                    </div>
                  ))}
                </div>
                <IngAddRow onAdd={addIngredient} />
                <div className="bl-note" style={{marginTop:8}}>Saved ingredients appear in the matching dropdown — flours on flour fields, inclusions on inclusion fields. Tap a tag to switch which. Price tracking will come later.</div>
              </div>
            </div>
          )}
          </>)}

          {homeTab === "starter" && (() => {
            const S = Math.max(0, +starter.mSeed || 0);
            const ratio = Math.max(0, +starter.mFlourRatio || 10);
            const flourTotal = S * ratio;
            const mflours = (starter.mFlour || []);
            const mPctSum = mflours.reduce((a, f) => a + (+f.pct || 0), 0);
            const waterG = flourTotal * (Math.max(0, +starter.mHyd || 0) / 100);
            const totalG = S + flourTotal + waterG;
            const nextDue = addDaysISO(starter.lastFed || todayISO(), Math.max(1, +starter.mIntervalDays || 7));
            const daysUntil = dateDiffDays(todayISO(), nextDue);
            const fedAgo = dateDiffDays(starter.lastFed || todayISO(), todayISO());
            const status = daysUntil < 0 ? "overdue" : daysUntil <= 1 ? "due" : "fresh";
            return (
            <div className="bl-starter">
              <div className="bl-st-hero">
                <div className="bl-st-id">
                  <div className="bl-st-name">◆ {starter.name}</div>
                  <div className="bl-st-est">EST {starter.est}</div>
                </div>
                <div className={"bl-st-status " + status}>
                  <div className="sts-dot" />
                  <div className="sts-text">
                    <b>{status === "overdue" ? `Overdue ${-daysUntil}d` : status === "due" ? (daysUntil === 0 ? "Due today" : "Due tomorrow") : `Fresh · ${daysUntil}d left`}</b>
                    <span>fed {fedAgo === 0 ? "today" : fedAgo === 1 ? "yesterday" : `${fedAgo}d ago`}</span>
                  </div>
                </div>
              </div>

              <div className="bl-st-panel">
                <h3>Character</h3>
                <div className="bl-re-row">
                  <div className="bl-field"><label>Name</label><BufferedInput className="bl-re-name-input" value={starter.name} onCommit={(v) => patchStarter({ name: v })} /></div>
                  <div className="bl-field2"><label>Established</label><input value={starter.est || ""} onChange={(e) => patchStarter({ est: e.target.value })} /></div>
                </div>
                <div className="bl-field"><label>Notes</label><BufferedInput className="bl-lev-expnote" rows={2} value={starter.notes || ""} onCommit={(v) => patchStarter({ notes: v })} placeholder="History, quirks, character…" /></div>
              </div>

              <div className="bl-st-panel">
                <h3>Maintenance feed</h3>
                <div className="bl-st-feedtop">
                  <div className="bl-field2"><label>Keep (seed) g</label><input type="number" min="0" value={starter.mSeed} onChange={(e) => patchStarter({ mSeed: Math.max(0, Number(e.target.value) || 0) })} /></div>
                  <div className="bl-field2"><label>Flour ×seed</label><input type="number" min="0" step="0.5" value={starter.mFlourRatio} onChange={(e) => patchStarter({ mFlourRatio: Math.max(0, Number(e.target.value) || 0) })} /></div>
                  <div className="bl-field2"><label>Hydration %</label><input type="number" min="0" value={starter.mHyd} onChange={(e) => patchStarter({ mHyd: Math.max(0, Number(e.target.value) || 0) })} /></div>
                  <div className="bl-field2"><label>Water temp °{tempUnit}</label><input type="number" value={Math.round(cToU(starter.mWaterTemp ?? 33))} onChange={(e) => patchStarter({ mWaterTemp: uToC(Number(e.target.value) || 0) })} /></div>
                </div>
                <div className="bl-st-subhead">Flour blend {mPctSum !== 100 ? <span className="bl-warn">· sums to {mPctSum}%, should be 100</span> : null}</div>
                {mflours.map((f, idx) => (
                  <div className="ing-row" key={f.id}>
                    <IngredientInput className="ing-name" value={f.name} onCommit={(v) => patchStarterMFlour(idx, { name: v })} placeholder="Flour" ingredients={ingredients} />
                    <div className="ing-pct"><input type="number" min="0" value={f.pct} onChange={(e) => patchStarterMFlour(idx, { pct: Math.max(0, Number(e.target.value) || 0) })} /><em>%</em></div>
                    <button className="ing-x" onClick={() => removeStarterMFlour(idx)}>×</button>
                  </div>
                ))}
                <button className="bl-add" onClick={addStarterMFlour}>+ Flour</button>

                <div className="bl-st-recipe">
                  <div className="str-hd">Tonight's feed for {starter.name}</div>
                  <div className="str-row"><span>Mature {starter.name} (keep)</span><b>{fmtG(S)} g</b></div>
                  {mflours.map((f) => <div className="str-row sub" key={f.id}><span>{f.name} ({f.pct}%)</span><b>{fmtG(flourTotal * (+f.pct || 0) / 100)} g</b></div>)}
                  <div className="str-row"><span>Water @ {showTemp(starter.mWaterTemp ?? 33)}</span><b>{fmtG(waterG)} g</b></div>
                  <div className="str-row tot"><span>Total after feed</span><b>{fmtG(totalG)} g</b></div>
                </div>
                <div className="bl-st-fridgenote">Build at {showTemp(starter.mWaterTemp ?? 33)} for a quick peak, then refrigerate at <b>~{starter.mFridgeAt}% of peak rise</b> — she walks off the rest as she cools. <input className="bl-st-inline-num" type="number" min="0" max="100" value={starter.mFridgeAt} onChange={(e) => patchStarter({ mFridgeAt: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />% peak</div>
              </div>

              <div className="bl-st-panel">
                <h3>Feeding schedule</h3>
                <div className="bl-st-feedtop">
                  <div className="bl-field2"><label>Last fed</label><input type="date" value={starter.lastFed || todayISO()} onChange={(e) => patchStarter({ lastFed: e.target.value })} /></div>
                  <div className="bl-field2"><label>Every (days)</label><input type="number" min="1" value={starter.mIntervalDays} onChange={(e) => patchStarter({ mIntervalDays: Math.max(1, Number(e.target.value) || 1) })} /></div>
                  <div className="bl-field2"><label>Next due</label><input type="text" readOnly value={nextDue} /></div>
                  <button className="bl-feed-btn" onClick={markFedToday}>Fed today ✓</button>
                </div>
                <div className="bl-note" style={{ marginTop: 8 }}>The status badge up top tracks this. Real push reminders arrive when BakeLab becomes a full app; for now the badge is your nudge whenever you open the home screen.</div>
              </div>

              <div className="bl-st-panel">
                <h3>Fermentation calibration</h3>
                <div className="bl-st-caltext">All measured against {starter.name} specifically. These constants drive the Levain tab's timing and water-temp math.</div>
                <div className="bl-st-subhead">Reference build</div>
                <div className="bl-st-feedtop">
                  <div className="bl-field2"><label>Ref temp °{tempUnit}</label><input type="number" value={Math.round(cToU(starter.refTemp ?? 24))} onChange={(e) => patchStarter({ refTemp: uToC(Number(e.target.value) || 0) })} /></div>
                  <div className="bl-field2"><label>Ref inoc %</label><input type="number" min="0" value={starter.refInoc} onChange={(e) => patchStarter({ refInoc: Math.max(0, Number(e.target.value) || 0) })} /></div>
                  <div className="bl-field2"><label>Ref hydration %</label><input type="number" min="0" value={starter.refHyd} onChange={(e) => patchStarter({ refHyd: Math.max(0, Number(e.target.value) || 0) })} /></div>
                  <div className="bl-field2"><label>Q10</label><input type="number" min="1" step="0.05" value={starter.q10} onChange={(e) => patchStarter({ q10: Math.max(1, Number(e.target.value) || 1) })} /></div>
                </div>
                <div className="bl-st-subhead">Hydration response · two builds, vary only hydration</div>
                <div className="bl-st-cal">
                  <div className="ic-row"><span className="ic-lab">Test A</span><input type="number" min="0" value={(starter.hydCal || [])[0]?.hyd || 0} onChange={(e) => patchStarterHydCal(0, { hyd: Math.max(0, Number(e.target.value) || 0) })} /><span className="ic-mid">% hyd → peaked in</span><input type="number" min="0" step="0.25" value={(starter.hydCal || [])[0]?.hrs || 0} onChange={(e) => patchStarterHydCal(0, { hrs: Math.max(0, Number(e.target.value) || 0) })} /><span className="ic-mid">h</span></div>
                  <div className="ic-row"><span className="ic-lab">Test B</span><input type="number" min="0" value={(starter.hydCal || [])[1]?.hyd || 0} onChange={(e) => patchStarterHydCal(1, { hyd: Math.max(0, Number(e.target.value) || 0) })} /><span className="ic-mid">% hyd → peaked in</span><input type="number" min="0" step="0.25" value={(starter.hydCal || [])[1]?.hrs || 0} onChange={(e) => patchStarterHydCal(1, { hrs: Math.max(0, Number(e.target.value) || 0) })} /><span className="ic-mid">h</span></div>
                </div>
                <div className={"ic-derived" + (hydResp.valid ? "" : " est")}>{hydResp.valid ? `→ each halving of hydration adds about ${Math.round(hydResp.hrs * 10) / 10} h` : "→ enter two real builds (same temp & seed) to calibrate"}</div>
                <div className="bl-st-subhead">Flour response · two builds, vary only whole-grain in levain</div>
                <div className="bl-st-cal">
                  <div className="ic-row"><span className="ic-lab">Test A</span><input type="number" min="0" value={(starter.wholeCal || [])[0]?.whole || 0} onChange={(e) => patchStarterWholeCal(0, { whole: Math.max(0, Number(e.target.value) || 0) })} /><span className="ic-mid">% whole → peaked in</span><input type="number" min="0" step="0.25" value={(starter.wholeCal || [])[0]?.hrs || 0} onChange={(e) => patchStarterWholeCal(0, { hrs: Math.max(0, Number(e.target.value) || 0) })} /><span className="ic-mid">h</span></div>
                  <div className="ic-row"><span className="ic-lab">Test B</span><input type="number" min="0" value={(starter.wholeCal || [])[1]?.whole || 0} onChange={(e) => patchStarterWholeCal(1, { whole: Math.max(0, Number(e.target.value) || 0) })} /><span className="ic-mid">% whole → peaked in</span><input type="number" min="0" step="0.25" value={(starter.wholeCal || [])[1]?.hrs || 0} onChange={(e) => patchStarterWholeCal(1, { hrs: Math.max(0, Number(e.target.value) || 0) })} /><span className="ic-mid">h</span></div>
                </div>
                <div className={"ic-derived" + (wholeResp.valid ? "" : " est")}>{wholeResp.valid ? `→ each +25% whole grain speeds the build by about ${Math.round(wholeResp.hrs * 10) / 10} h` : "→ enter two real builds (same temp, seed & hydration) to calibrate"}</div>
                <div className="bl-note" style={{ marginTop: 10 }}>Levain builds use straight bread flour as the baseline (0% whole). The flour response is calibrated against that, so the 5% rye pre-ferment you're testing will read as a small speed-up once you log it.</div>
              </div>
            </div>
            );
          })()}

        </div>
      )}

      {view === "editor" && (<>
      <div className="bl-head">
        <div className="bl-brandstrip"><HapLogo className="bl-hap-logo-sm" /><span className="bl-prodname-sm">BakeLab</span></div>
        <div className="bl-dayhd">
          <button className="bl-back" onClick={backHome} title="Bake days" aria-label="Home"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v9h5v-5h4v5h5v-9" /></svg></button>
          <BufferedInput className="bl-dayname" value={dayName} onCommit={(v) => setDayName(v)} placeholder="Bake day name" />
          <input className="bl-daydate" type="date" value={dayDate} onChange={(e) => handleDayDateChange(e.target.value)} />
          <div className="bl-unittoggle bl-unittoggle-hd">
            <button className={tempUnit === "C" ? "on" : ""} onClick={() => setTempUnit("C")}>°C</button>
            <button className={tempUnit === "F" ? "on" : ""} onClick={() => setTempUnit("F")}>°F</button>
          </div>
        </div>
      </div>

      <div className={"bl-tabs" + (navHidden ? " navhidden" : "")} ref={tabsRef}>
        <button className={"bl-tab" + (tab === "plan" ? " on" : "")} onClick={() => goTab("plan")}><span className="num">1</span><span className="tlabel">Plan</span><span className="tshort">Plan</span></button>
        <button className={"bl-tab" + (tab === "prep" ? " on" : "")} onClick={() => goTab("prep")}><span className="num">2</span><span className="tlabel">Prep &amp; Shop</span><span className="tshort">Prep</span></button>
        <button className={"bl-tab" + (tab === "levain" ? " on" : "")} onClick={() => goTab("levain")}><span className="num">3</span><span className="tlabel">Levain</span><span className="tshort">Levain</span></button>
        <button className={"bl-tab" + (tab === "build" ? " on" : "")} onClick={() => goTab("build")}><span className="num">4</span><span className="tlabel">Mix</span><span className="tshort">Mix</span></button>
        <button className={"bl-tab" + (tab === "fold" ? " on" : "")} onClick={() => goTab("fold")}><span className="num">5</span><span className="tlabel">Fold &amp; Shape</span><span className="tshort">Shape</span></button>
        <button className={"bl-tab" + (tab === "bake" ? " on" : "")} onClick={() => goTab("bake")}><span className="num">6</span><span className="tlabel">Bake</span><span className="tshort">Bake</span></button>
        <button className={"bl-tab" + (tab === "safety" ? " on" : "")} onClick={() => goTab("safety")}><span className="num">7</span><span className="tlabel">Food Safety</span><span className="tshort">Safety</span></button>
      </div>

      {/* ---------- TAB 1: PLANNING ---------- */}
      {tab === "plan" && (<>
      <div className="bl-panel">
        <h3>Recipes & quantities — baker's %</h3>
        <div className="bl-types">
          {types.map((t, ti) => {
            const sm = plan.summaries[ti];
            return (
              <div className="bl-type" key={ti}>
                <div className="bl-card-hd">
                  <span className="cardno">Recipe {ti + 1}</span>
                  {types.length > 1 && <button className="bl-rmcard" title="Remove this recipe from the day" onClick={() => removeSlot(ti)}>× Remove</button>}
                </div>
                <div className="bl-rec-load">
                  <div className="bl-rec-title">{t.name || <em className="bl-rec-none">No recipe loaded</em>}</div>
                  <select className="bl-loadsel-core" value={slots[ti].coreRecipeId || ""} onChange={(e) => { if (e.target.value) loadCoreRecipe(ti, e.target.value); }}>
                    <option value="">Load core recipe…</option>
                    {coreRecipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="bl-rec-top">
                  <div><label>Loaves</label><input className="n" type="number" min="0" value={t.loaves} onChange={(e) => setLoaves(ti, e.target.value)} /></div>
                  <div><label>Loaf g</label><input className="n" type="number" min="0" value={t.loafWeight} onChange={(e) => setDraft(ti, { loafWeight: Math.max(0, Number(e.target.value) || 0) })} /></div>
                  <div><label>Autolyse min</label><input className="n" type="number" min="0" value={t.autolyse ?? 45} onChange={(e) => setDraft(ti, { autolyse: Math.max(0, Number(e.target.value) || 0) })} /></div>
                </div>
                <div className="bl-rec-sessions">
                  {(slots[ti].sessions || []).map((sess, si) => {
                    const lv = sessionLoaves(slots[ti], si);
                    const isMain = si === 0;
                    const over = (slots[ti].sessions || []).slice(1).reduce((a, s) => a + Math.max(0, +(s.loaves) || 0), 0) > t.loaves;
                    return (
                      <div className={"bl-sess-row" + (isMain && over ? " over" : "")} key={sess.id}>
                        <span className="ss-no">Bake {si + 1}{isMain ? " ←" : ""}</span>
                        <input type="date" value={sess.date || todayISO()} onChange={(e) => setSlotSessionDate(ti, si, e.target.value)} />
                        {isMain
                          ? <span className="ss-lv-auto">{lv} loaves</span>
                          : <><input className="n ss-lv" type="number" min="0" value={sess.loaves || 0} onChange={(e) => setSlotSessionLoaves(ti, si, e.target.value)} /><span className="ss-lvu">loaves</span><button className="ing-x" onClick={() => removeSlotSession(ti, si)}>×</button></>
                        }
                      </div>
                    );
                  })}
                  <button className="bl-addrow" onClick={() => addSlotSession(ti)}>+ Bake session</button>
                </div>
                {types.length > 1 && (
                  <div className="bl-orders">
                    <div><label>Mix order</label>
                      <select value={t.mixOrder || ti + 1} onChange={(e) => setMixOrder(ti, Number(e.target.value))}>
                        {types.map((_, k) => <option key={k} value={k + 1}>{k + 1}</option>)}
                      </select>
                    </div>
                    <div><label>Bake order</label>
                      <select value={t.bakeOrder || ti + 1} onChange={(e) => setBakeOrder(ti, Number(e.target.value))}>
                        {types.map((_, k) => <option key={k} value={k + 1}>{k + 1}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                <div className="bl-subhead">Flours · main flour balances to 100%</div>
                {t.flours.map((f, idx) => (
                  <div className="ing-row" key={f.id}>
                    <IngredientInput className="ing-name" value={f.name} onCommit={(v) => setFlourName(ti, idx, v)} placeholder={"Flour " + (idx + 1)} ingredients={ingredients} />
                    {idx === 0
                      ? <div className="ing-pct main"><b>main</b><span>{mainPct(t)}</span><em>%</em></div>
                      : <div className="ing-pct"><input type="number" min="0" value={f.pct} onChange={(e) => setFlourPct(ti, idx, e.target.value)} /><em>%</em></div>}
                    {idx === 0 ? <span className="ing-x ph" /> : <button className="ing-x" title="Remove flour" onClick={() => removeFlour(ti, idx)}>×</button>}
                  </div>
                ))}
                <button className="bl-add" onClick={() => addFlour(ti)}>+ Flour</button>

                <div className="bl-subhead">Water · Salt</div>
                <div className="bl-fixed">
                  <div className="cell"><label>Water</label><div className="wrap"><input type="number" min="0" value={t.water} onChange={(e) => setFixed(ti, "water", e.target.value)} /><span className="pc">%</span></div></div>
                  <div className="cell"><label>Salt</label><div className="wrap"><input type="number" min="0" value={t.salt} onChange={(e) => setFixed(ti, "salt", e.target.value)} /><span className="pc">%</span></div></div>
                </div>

                <div className="bl-subhead bl-lev-sh">Levain <span className="bl-lev-starter">◆ {starter.name}</span></div>
                <div className="bl-lev-section">
                  <div className="bl-fixed">
                    <div className="cell"><label>Levain</label><div className="wrap"><input type="number" min="0" value={t.levain} onChange={(e) => setFixed(ti, "levain", e.target.value)} /><span className="pc">%</span></div></div>
                    <div className="cell"><label>Hydration</label><div className="wrap"><input type="number" min="0" value={t.levHyd ?? 80} onChange={(e) => setDraft(ti, { levHyd: Math.max(0, Number(e.target.value) || 0) })} /><span className="pc">%</span></div></div>
                    <div className="cell"><label>Inoculation</label><div className="wrap"><input type="number" min="0" value={t.levInoc ?? 10} onChange={(e) => setDraft(ti, { levInoc: Math.max(0, Number(e.target.value) || 0) })} /><span className="pc">%</span></div></div>
                  </div>
                  <div className="bl-lev-grid">
                    <div className="bl-field2"><label>Build to peak (h)</label><input type="number" min="0" step="0.25" value={t.levBuildHrs ?? 5} onChange={(e) => setDraft(ti, { levBuildHrs: Math.max(0, Number(e.target.value) || 0) })} /></div>
                    <div className="bl-field2"><label>Ref temp (°{tempUnit})</label><input type="number" value={Math.round(cToU(t.levRefTemp ?? 24))} onChange={(e) => setDraft(ti, { levRefTemp: uToC(Number(e.target.value) || 0) })} /></div>
                    <div className="bl-field2"><label>Whole grain in levain</label><div className="wrap2"><input type="number" min="0" value={t.levWhole ?? 0} onChange={(e) => setDraft(ti, { levWhole: Math.max(0, Number(e.target.value) || 0) })} /><span className="pc">%</span></div></div>
                  </div>
                  <div className="bl-lev-exp"><label>Levain flour / experiment note</label><BufferedInput className="bl-lev-expnote" value={t.levExpNote || ""} onCommit={(v) => setDraft(ti, { levExpNote: v })} placeholder="e.g. straight bread flour · or 5% rye pre-ferment" /></div>
                  <div className="bl-lev-hint">Timing, water temp and the build recipe are computed on the <b>Levain</b> tab from {starter.name}'s calibration.</div>
                </div>

                <div className="bl-subhead">Inclusions</div>
                {t.inclusions.length === 0 && <div className="ing-empty">No inclusions</div>}
                {t.inclusions.map((f, idx) => (
                  <div className="ing-row" key={f.id}>
                    <IngredientInput className="ing-name" value={f.name} onCommit={(v) => setIncName(ti, idx, v)} placeholder={"Inclusion " + (idx + 1)} ingredients={ingredients} kind="inclusion" />
                    <div className="ing-pct"><input type="number" min="0" value={f.pct} onChange={(e) => setIncPct(ti, idx, e.target.value)} /><em>%</em></div>
                    <button className="ing-x" title="Remove inclusion" onClick={() => removeInc(ti, idx)}>×</button>
                  </div>
                ))}
                <button className="bl-add" onClick={() => addInc(ti)}>+ Inclusion</button>

                <div className="bl-subhead">Banneton shape</div>
                <div className="bl-shape">
                  <button className={"shp" + ((t.shape || "round") !== "oval" ? " on" : "")} onClick={() => setDraft(ti, { shape: "round" })}>Round</button>
                  <button className={"shp" + (t.shape === "oval" ? " on" : "")} onClick={() => setDraft(ti, { shape: "oval" })}>Oval</button>
                </div>

                <div className="bl-typesum">
                  {sm.loaves > 0 ? (<>
                    <b>{sm.loaves}</b> loaves × <b>{sm.W}g</b> = <b>{fmtKg(sm.totalDough)}</b> dough → {sm.impossible
                      ? <span className="bl-warn">loaf heavier than batch cap — raise capacity</span>
                      : <><b>{sm.batchCount}</b> {sm.batchCount === 1 ? "batch" : "batches"} ({sm.sizes.join(", ")} loaves)</>}
                    {sm.floursOver && <div className="bl-warn">⚠ other flours exceed 100% — main flour pinned at 0%</div>}
                  </>) : <span style={{ opacity: .6 }}>0 loaves — type inactive</span>}
                </div>
                <button className="bl-remix-btn" onClick={() => remixRecipe(ti)} title="Save current adjustments as a dated remix in the Recipe Builder">Remix →</button>
              </div>
            );
          })}
        </div>
        <button className="bl-addrec" onClick={addSlot}>+ Add another recipe</button>

        <div className="bl-cap">
          <div className="bl-field"><label>Max dough per batch (kg)</label>
            <input type="number" min="0" step="0.5" value={maxBatch / 1000} onChange={(e) => setMaxBatch(Math.max(0, (Number(e.target.value) || 0) * 1000))} /></div>
          <div className="note">This capacity — your mixer / bulk vessel — decides the batch count, not the loaf total. At {maxBatch / 1000}kg you can mix ~{Math.floor(maxBatch / 850)} loaves at 850g per batch. Per-batch weights appear under Batch builds.</div>
        </div>
      </div>

      {/* ---------- SETUP + CHART ---------- */}
      <div className="bl-grid">
        <div>
          <div className="bl-panel">
            <h3>Day setup</h3>
            <div className="bl-field"><label>Start time (earliest cycle)</label><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
            <div className="bl-field"><label>Batches (from planner)</label><div className="bl-ro">{plan.list.length} batch{plan.list.length === 1 ? "" : "es"}</div></div>
            <div className="bl-field"><label>Even spacing <span className="bl-slider-val">{stagger}m</span></label>
              <input type="range" min="0" max={cycleMin} step={SNAP} value={stagger} onChange={(e) => distribute(Number(e.target.value))} /></div>
            <button className="bl-btn block" onClick={autoSpace} disabled={totalBatches < 2} style={totalBatches < 2 ? { opacity: .45, cursor: "not-allowed" } : {}}>⚡ Auto-space to clear collisions</button>
            <div className="bl-note">Slider/auto-space sets even gaps. Then <b>drag any row</b> on the chart to fine-tune one cycle — stage lengths stay fixed.</div>
          </div>

          <div className="bl-panel">
            <h3>Cycle timing — shared (autolyse is per recipe)</h3>
            <div className="bl-recipe">
              {NUM("Mix (min)", "mix")}
              {NUM("# of folds", "folds")}{NUM("Fold (min)", "fold")}
              {NUM("Rest between folds", "restBetween", true)}{NUM("Bulk rest (final)", "bulkRest", true)}
              {NUM("Pre-shape (min)", "preShape")}{NUM("Bench rest (min)", "benchRest")}{NUM("Shape (min)", "shape")}
            </div>
            <div className="bl-note">One cycle = {fmtDur(cycleMin)}. Same timing for every batch. Hands-on: Mix, Folds, Pre-shape, Shape.</div>
          </div>
        </div>

        <div>
          <div className="bl-legend">
            <span><span className="sw a" /> hands-on (constraint)</span>
            <span><span className="sw p" /> passive (overlaps freely)</span>
            <span><span className="sw x" /> collision — two batches need you</span>
          </div>
          <p className="bl-hint">↔ Grab a row and drag to slide that whole cycle.</p>
          <div className="bl-chart-wrap">
            <div style={{ minWidth: 108 + span * PX + 30 }}>
              <div className="bl-axis" style={{ width: span * PX }}>
                {axisTicks.map((t) => <div key={t} className="bl-tick" style={{ left: t * PX }}>{fmtClock(startMin + t)}</div>)}
              </div>
              {schedule.map((row) => {
                const info = plan.list[row.batch];
                return (
                  <div className="bl-rowline" key={row.batch}>
                    <div className="bl-rowlabel">
                      <div className="b">B{row.batch + 1}{info ? ` · ${info.name}` : ""}</div>
                      <div className="t">{fmtClock(startMin + row.base)}{info ? ` · ${info.size}×` : ""}</div>
                    </div>
                    <div className={"bl-track" + (drag && drag.b === row.batch ? " grabbing" : "")} style={{ width: span * PX }}
                      onPointerDown={(e) => onDown(e, row.batch)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
                      {axisTicks.map((t) => <div key={t} className="bl-gridcol" style={{ left: t * PX }} />)}
                      {row.blocks.map((bl, i) => {
                        const hit = bl.active && collisionSet.has(`${bl.batch}-${i}`);
                        const cls = hit ? "x" : bl.active ? "a" : "p"; const w = bl.min * PX;
                        return (
                          <div key={i} className={"bl-bar " + cls} style={{ left: bl.startOff * PX, width: Math.max(w, 2) }}
                            onPointerDown={(e) => onDown(e, row.batch)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                            onMouseEnter={(e) => !drag && setHover({ batch: bl.batch, type: info ? info.name : "", name: bl.name, min: bl.min, s: bl.startOff, e: bl.endOff, hit, x: e.clientX, y: e.clientY })}
                            onMouseMove={(e) => setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))}
                            onMouseLeave={() => setHover(null)}>
                            {w > 34 ? bl.name : ""}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bl-sched">
            <h3>Schedule overview</h3>
            <div className="sub">{collisionCount > 0 ? `${collisionCount} step(s) collide — drag a cycle apart, or hit Auto-space.` : "No collisions — this day is workable as scheduled."}</div>
          </div>
        </div>
      </div>
      </>)}

      {/* ---------- TAB 2: PREP & SHOPPING ---------- */}
      {tab === "prep" && (
        <div className="bl-panel">
          <h3>Prep &amp; shopping — production-week snapshot</h3>
          <div className="bl-rep-stats">
            <div className="bl-rep-stat"><div className="v">{report.totalLoaves}</div><div className="l">Loaves</div></div>
            <div className="bl-rep-stat"><div className="v">{plan.list.length}</div><div className="l">Batches</div></div>
            <div className="bl-rep-stat"><div className="v">{fmtKg(report.totalDough)}</div><div className="l">Total dough</div></div>
            <div className="bl-rep-stat"><div className="v">{fmtClock(startMin)}</div><div className="l">First start</div></div>
            <div className="bl-rep-stat"><div className="v">{fmtClock(startMin + lastEnd)}</div><div className="l">Shaping done</div></div>
            <div className="bl-rep-stat"><div className="v">{fmtDur(totalActiveMin)}</div><div className="l">Hands-on</div></div>
          </div>
          <div className="bl-rep-grid">
            <div className="bl-card">
              <div className="ch">Ingredients to have on hand</div>
              {report.ingList.length === 0 ? <div className="bl-line"><span className="nm" style={{ opacity: .6 }}>No ingredients yet</span></div> : (() => {
                let lastCat = null; const catName = { flour: "Flours", liquid: "Water · Salt · Levain", inc: "Inclusions" };
                return report.ingList.map((x, idx) => {
                  const head = x.cat !== lastCat; lastCat = x.cat;
                  return (<React.Fragment key={idx}>
                    {head && <div className="bl-line cat">{catName[x.cat]}</div>}
                    <div className={"bl-line" + (x.name.toLowerCase() === "levain" ? " hi" : "")}><span className="nm">{x.name}</span><span className="v">{fmtWt(x.g)}</span></div>
                  </React.Fragment>);
                });
              })()}
            </div>
            <div>
              <div className="bl-card" style={{ marginBottom: 16 }}>
                <div className="ch">Bannetons (one per loaf)</div>
                {Object.keys(report.bann).length === 0 ? <div className="bl-line"><span className="nm" style={{ opacity: .6 }}>—</span></div> :
                  Object.entries(report.bann).map(([sh, n]) => <div className="bl-line" key={sh}><span className="nm">{sh === "oval" ? "Oval" : "Round"} bannetons</span><span className="v">{n}</span></div>)}
              </div>
              <div className="bl-card">
                <div className="ch">Hand-mix / bulk vessels</div>
                {report.vessels.length === 0 ? <div className="bl-line"><span className="nm" style={{ opacity: .6 }}>—</span></div> :
                  report.vessels.map((v) => <div className="bl-line" key={v.i}><span className="nm">B{v.i + 1} · {v.name} ({v.size} loaves)</span><span className="v">≥ {v.liters} L</span></div>)}
              </div>
            </div>
          </div>
          <div className="bl-note">Vessel size assumes ~{BULK_HEADROOM}× dough volume for bulk expansion plus hand-mixing room, at ~{DOUGH_DENSITY} g/mL dough density — both adjustable. Levain total is what you’ll need to build ahead. Banneton counts assume one per loaf with no reuse across staggered proofs.</div>
        </div>
      )}

      {/* ---------- TAB 3: LEVAIN ---------- */}
      {tab === "levain" && (
        <div className="bl-panel">
          <h3>Levain — build timing &amp; recipe</h3>
          <div className="bl-cond">
            <div className="bl-field2"><label>Ambient / flour temp (°{tempUnit})</label><input type="number" value={Math.round(cToU(ambientTemp))} onChange={(e) => setAmbientTemp(uToC(Number(e.target.value) || 0))} /></div>
            <div className="bl-field2"><label>Mature starter temp (°{tempUnit})</label><input type="number" value={Math.round(cToU(starterTemp))} onChange={(e) => setStarterTemp(uToC(Number(e.target.value) || 0))} /></div>
            <div className="bl-feedmode">
              <label>Feed timing</label>
              <div className="bl-unittoggle">
                <button className={feedMode === "auto" ? "on" : ""} onClick={() => setFeedMode("auto")}>Auto</button>
                <button className={feedMode === "manual" ? "on" : ""} onClick={() => setFeedMode("manual")}>I'll pick</button>
              </div>
            </div>
            <div className="bl-feedmode">
              <label>Calibration</label>
              <button className={"bl-calbtn" + (showCal ? " on" : "")} onClick={() => setShowCal((v) => !v)}>{showCal ? "Hide" : "Calibrate"}</button>
            </div>
            {feedMode === "manual" && (
              <div className="bl-field2"><label>Feed at</label><input type="time" value={feedTime} onChange={(e) => setFeedTime(e.target.value)} /></div>
            )}
            <div className="bl-feed">
              <span>Feed all levains at</span>
              <b>{fmtClock(startMin + levainPlan.feedOff)}</b>
              {levainPlan.feedOff < 0 && <em>night before</em>}
              {feedMode === "manual" && <em className="autoref">auto would be {fmtClock(startMin + levainPlan.autoFeed)}</em>}
            </div>
          </div>

          {feedMode === "manual" && (
            <div className="bl-recalhint">Pick when you actually want to feed — the app sets each levain's water temp (colder = peaks later) so the first one is ripe right when your mix day starts. A cold starter lets the water run warmer. The earliest-needed levain caps how late you can feed; later builds get the coldest water.</div>
          )}

          {showCal && (
          <div className="bl-inoccal">
            <div className="bl-inoccal-hd">How inoculation affects timing — calibrate from a test</div>
            <div className="bl-inoccal-rows">
              <div className="ic-row"><span className="ic-lab">Test A</span><input type="number" min="0" value={inocCal[0].inoc} onChange={(e) => setCal(0, "inoc", e.target.value)} /><span className="ic-mid">% seed → peaked in</span><input type="number" min="0" step="0.25" value={inocCal[0].hrs} onChange={(e) => setCal(0, "hrs", e.target.value)} /><span className="ic-mid">h</span></div>
              <div className="ic-row"><span className="ic-lab">Test B</span><input type="number" min="0" value={inocCal[1].inoc} onChange={(e) => setCal(1, "inoc", e.target.value)} /><span className="ic-mid">% seed → peaked in</span><input type="number" min="0" step="0.25" value={inocCal[1].hrs} onChange={(e) => setCal(1, "hrs", e.target.value)} /><span className="ic-mid">h</span></div>
            </div>
            <div className={"ic-derived" + (inocResp.valid ? "" : " est")}>{inocResp.valid ? `→ each time you halve the seed, the levain runs about ${Math.round(inocResp.hrs * 10) / 10} h slower` : "→ enter two real builds at the same temperature to calibrate (using a 1.5 h estimate until then)"}</div>
          </div>
          )}

          {types.map((t, ti) => (plan.summaries[ti].loaves > 0 ? (
            <div className="bl-levread" key={ti}>
              <span className="lr-nm">{t.name}</span>
              <span className="lr-spec">{t.levInoc ?? 10}% seed · {t.levHyd ?? 80}% hyd{(t.levWhole ?? 0) > 0 ? ` · ${t.levWhole}% whole` : ""} · ref {showTemp(t.levRefTemp ?? 24)} / {t.levBuildHrs ?? 5}h</span>
              {t.levExpNote ? <span className="lr-exp">{t.levExpNote}</span> : null}
            </div>
          ) : null))}
          <div className="bl-note" style={{ marginTop: 0 }}>Levain parameters live on each recipe card in <b>Plan</b>. This tab is read-only output: it solves feed time, water temp and the build recipe from those parameters and {starter.name}'s calibration.</div>

          {levainPlan.builds.length === 0 ? (
            <div className="bl-emptytab">Set loaf counts in Planning to schedule levain builds.</div>
          ) : (
            <div className="bl-levbuilds">
              {levainPlan.builds.map((bd, i) => {
                const tooCold = !bd.retarded && (bd.Tlev < 2 || bd.Twater < 1);
                const slowZone = !bd.retarded && !tooCold && bd.Tlev < 10;
                const tooWarm = !bd.retarded && (bd.Tlev > 30 || bd.Twater > 45);
                const serves = bd.items.map((x) => "B" + (x.gi + 1)).join(", ");
                return (
                  <div className={"bl-levcard" + (tooCold || tooWarm || bd.retardLate ? " warn" : "") + (slowZone ? " caution" : "") + (bd.retarded ? " retarded" : "")} key={i}>
                    <div className="lh">
                      <span className="nm">{bd.name} levain</span>
                      <span className="sv">serves {serves}</span>
                      <label className="lretard"><input type="checkbox" checked={bd.retarded} onChange={() => toggleRetard(bd.key)} /> cold retard</label>
                    </div>
                    <div className="lwater"><span className="wt">{showTemp(bd.Twater)}</span><span className="wl">build water temp{bd.retarded ? " · then fridge" : ""}</span></div>
                    <div className="lrows">
                      <div className="lrow"><span>Feed</span><b>{fmtClock(startMin + levainPlan.feedOff)}</b></div>
                      <div className="lrow"><span>{bd.retarded ? "Peaks" : "Peak by"}</span><b>{fmtClock(startMin + bd.peakOff)}</b>{!bd.retarded && bd.holdMin > 0 ? <em> · hold {fmtDur(bd.holdMin)}</em> : null}</div>
                      {bd.retarded && <div className="lrow retardrow"><span>❄ Retard</span><b>{fmtDur(bd.retardHold)}</b><em> → mix {fmtClock(startMin + bd.targetPeak)}</em></div>}
                      <div className="lrow"><span>Build time</span><b>{fmtDur(bd.retarded ? bd.baseAdjMin : bd.desired)}</b></div>
                      <div className="lrow"><span>Seed {Math.round(bd.I * 10) / 10}% → @ref</span><b>{fmtDur(bd.baseAdjMin)}</b></div>
                      <div className="lrow"><span>Levain temp</span><b>~{showTemp(bd.Tlev)}</b></div>
                    </div>
                    <div className="lmix">
                      <div className="ing"><span>Mature starter</span><span>{fmtG(bd.seedL)} g</span></div>
                      <div className="ing"><span>Flour</span><span>{fmtG(bd.flourL)} g</span></div>
                      <div className="ing"><span>Water</span><span>{fmtG(bd.waterL)} g</span></div>
                      <div className="ing tot"><span>Total levain</span><span>{fmtG(bd.M)} g</span></div>
                    </div>
                    {bd.retarded && bd.retardLate && <div className="lwarn">⚠ Even at room temp this peaks after the mix — it won't be ready in time. Feed earlier.</div>}
                    {bd.retarded && !bd.retardLate && <div className="lretardnote">Built at normal temp to peak, then held cold to preserve it until mix — no extreme water or seed needed.</div>}
                    {tooCold && <div className="lwarn">⚠ Needs a near-freezing build to peak this late. Feed earlier, or tick <b>cold retard</b> to build normally and fridge-hold it instead.</div>}
                    {!tooCold && tooWarm && <div className="lwarn">⚠ Feed time is too late for this build — it would need a hot levain ({showTemp(bd.Tlev)}). Feed earlier.</div>}
                    {!tooCold && !tooWarm && slowZone && <div className="lcaution">Below ~10°C the doubling-per-10°C model gets loose — calibrate it, or tick <b>cold retard</b> to sidestep the cold build entirely.</div>}
                  </div>
                );
              })}
            </div>
          )}
          {levainPlan.builds.length > 0 && (() => {
            const blds = levainPlan.builds;
            const minOff = Math.min(levainPlan.feedOff, ...blds.map((b) => levainPlan.feedOff));
            const maxOff = Math.max(...blds.map((b) => Math.max(b.targetPeak, b.peakOff)));
            const span = Math.max(60, maxOff - minOff);
            const pad = span * 0.04;
            const lo = minOff - pad, hi = maxOff + pad, totalSpan = hi - lo;
            const pct = (off) => ((off - lo) / totalSpan) * 100;
            const tickStep = totalSpan > 720 ? 120 : 60;
            const firstTick = Math.ceil(lo / tickStep) * tickStep;
            const ticks = []; for (let tk = firstTick; tk <= hi; tk += tickStep) ticks.push(tk);
            return (
              <div className="bl-lev-gantt">
                <div className="lg-title">Levain timeline</div>
                <div className="lg-scroll">
                  <div className="lg-inner">
                    <div className="lg-axis">
                      {ticks.map((tk) => <div className="lg-tick" key={tk} style={{ left: pct(tk) + "%" }}><span>{fmtClock(startMin + tk)}</span></div>)}
                    </div>
                    {blds.map((b, i) => {
                      const feedX = pct(levainPlan.feedOff), peakX = pct(b.peakOff), mixX = pct(b.targetPeak);
                      return (
                        <div className="lg-row" key={i}>
                          <div className="lg-rowlabel"><b>{b.name}</b><span>{b.items.map((x) => "B" + (x.gi + 1)).join(",")}</span></div>
                          <div className="lg-track">
                            {/* build phase: feed → peak */}
                            <div className="lg-bar build" style={{ left: feedX + "%", width: Math.max(0.5, peakX - feedX) + "%" }} title="building" />
                            {/* retard hold: peak → mix */}
                            {b.retarded && b.retardHold > 0 && <div className="lg-bar retard" style={{ left: peakX + "%", width: Math.max(0.5, mixX - peakX) + "%" }} title="cold retard" />}
                            {/* feed marker */}
                            <div className="lg-mark feed" style={{ left: feedX + "%" }}><span className="lg-dot" /><span className="lg-mlab">feed {fmtClock(startMin + levainPlan.feedOff)}</span></div>
                            {/* peak marker */}
                            <div className="lg-mark peak" style={{ left: peakX + "%" }}><span className="lg-dot" /><span className="lg-mlab">{b.retarded ? "peak" : "peak/use"} {fmtClock(startMin + b.peakOff)}</span></div>
                            {/* mix marker (only distinct when retarded) */}
                            {b.retarded && <div className="lg-mark mix" style={{ left: mixX + "%" }}><span className="lg-dot" /><span className="lg-mlab">mix {fmtClock(startMin + b.targetPeak)}</span></div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="lg-legend"><span className="lg-key build">build</span><span className="lg-key retard">❄ retard hold</span><span className="lg-key peakk">● peak</span></div>
              </div>
            );
          })()}
          <div className="bl-note">In <b>Auto</b>, the app feeds whenever the schedule demands. In <b>I'll pick</b>, you choose the feed time and it solves each build's water temp so the first ripens when your mix day starts. <b>Inoculation, hydration and levain flour all drive timing</b> via {starter.name}'s calibration; lower seed or stiffer levain stretches the natural rise, whole grain shortens it. Retarded builds peak naturally then hold cold (blue) until mix. Speed scales by Q10 per 10°C; below ~10°C it's approximate. Builds auto-split past a 90-min mix spread.</div>
        </div>
      )}

      {/* ---------- TAB 4: BATCH BUILDS / AUTOLYSE ---------- */}
      {tab === "build" && (
        <div className="bl-panel">
          <div className="bl-mixwater-bar">
            <button className="bl-mixwater-btn" onClick={() => setCalcOpen(true)}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0Z"/></svg>
              Dough temp calculator
            </button>
            <button className="bl-mixwater-btn alt" onClick={() => setLabelOpen(true)} disabled={!plan.list || plan.list.length === 0}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>
              Print labels
            </button>
            {mixWaterTemp != null && (
              <span className="bl-mixwater-cur">Mix water <b>{showTemp(mixWaterTemp)}</b><button onClick={() => setMixWaterTemp(null)} title="Clear" aria-label="Clear mix water">×</button></span>
            )}
          </div>
          <h3>Batch builds · Autolyse — tap a batch to focus</h3>
          {plan.list.length === 0 ? (
            <div className="bl-emptytab">Set loaf counts in Planning to generate batches.</div>
          ) : (<>
            <div className="bl-progress">
              <span>{doneBatches.filter((d) => d < plan.list.length).length} of {plan.list.length} batches built</span>
              {doneBatches.length > 0 && <button onClick={() => { setDoneBatches([]); setActiveBatch(null); }}>Reset progress</button>}
            </div>
            <div className="bl-builds">
              {plan.list.map((b, i) => {
                const t = types[b.ti];
                const cols = ingLines(t).filter((l) => l.pct > 0);
                const base = schedule[i] ? schedule[i].base : 0;
                const mixStart = base + ((t && t.autolyse != null ? +t.autolyse : +params.autolyse) || 0);
                const isA = activeBatch === i, isD = doneBatches.includes(i);
                return (
                  <div className={"bl-build" + (isA ? " active" : "") + (isD ? " done" : "")} key={i} onClick={() => setActiveBatch(isA ? null : i)}>
                    <div className="bh"><span className="bn">B{i + 1}</span><span className="bt">{t.name}{isD ? " · ✓ built" : ""}</span></div>
                    <div className="meta"><span>Autolyse <b>{fmtClock(startMin + base)}</b></span><span>Mix <b>{fmtClock(startMin + mixStart)}</b></span></div>
                    <div className="meta"><span><b>{b.size}</b> loaves</span><span><b>{fmtG(b.dough)}</b> g dough</span><span>{(t.shape || "round") === "oval" ? "Oval" : "Round"}</span></div>
                    {cols.map((l) => <div className="ing" key={l.key}><span className="nm">{l.name}</span><span className="g">{fmtG(b.weights[l.key])} g{l.key === "water" && mixWaterTemp != null ? <em className="bl-watertemp"> · {showTemp(mixWaterTemp)}</em> : null}</span></div>)}
                    {isA && <button className="bl-donebtn" onClick={(e) => { e.stopPropagation(); completeAndNext(i); }}>Done — built ✓</button>}
                  </div>
                );
              })}
            </div>
          </>)}
          <div className="bl-note">Tap a batch to scale it up and focus; “Done” greys it and jumps to the next. Weights in grams (raw); times follow the Planning schedule. Levain counts by weight, so true hydration sits a touch above the water %.</div>
          {calcOpen && <DoughTempCalc tempUnit={tempUnit} uToC={uToC} cToU={cToU} initial={calcInputs} current={mixWaterTemp} onApply={(c, inputs) => { setMixWaterTemp(c); setCalcInputs(inputs); }} onClose={() => setCalcOpen(false)} />}
        </div>
      )}

      {/* ---------- TAB 4: BAKE · NOW & NEXT ---------- */}
      {tab === "fold" && (() => {
        const liveSpan = Math.max(lastEnd, 60);
        const nowOff = nowMin - startMin;
        const nowX = LIVE_LABEL + Math.min(Math.max(nowOff, 0), liveSpan) * LIVE_PX;
        const ticks = []; for (let t = 0; t <= liveSpan + 30; t += 30) ticks.push(t);
        const rows = schedule.length;
        const rowH = liveFull ? Math.max(36, Math.min(110, Math.floor((vh - 165) / Math.max(rows, 1)))) : LIVE_ROW;
        const barH = Math.max(22, Math.min(42, rowH - 18));
        const barTop = (rowH - barH) / 2;
        const innerH = LIVE_AXIS + rows * rowH;
        const status = nowOff < 0
          ? <>Day starts at <b>{fmtClock(startMin)}</b> — in {fmtDelta(-nowOff)}</>
          : !live.hero ? <>All folding &amp; shaping complete</>
          : (live.hero.startOff - live.nowOff <= 0
            ? <><span className="dot" />Now: <b>B{live.hero.batch + 1} {live.hero.name}</b></>
            : <>Next: <b>B{live.hero.batch + 1} {live.hero.name}</b> in {fmtDelta(live.hero.startOff - live.nowOff)}</>);
        return (
          <div className={"bl-panel lv-screen" + (liveFull ? " full" : "")}>
            <div className="bl-live-top">
              <div className="bl-clock">{fmtClock(nowMin)}<small>now · day start {fmtClock(startMin)}</small></div>
              <div className="bl-livebtns">
                <button className={"bl-anchor" + (follow ? " ghost" : "")} onClick={() => { setFollow(true); centerNow(); }}>{follow ? "● Live" : "Jump to now"}</button>
                <button className="bl-anchor ghost" onClick={() => setLiveFull((f) => !f)}>{liveFull ? "⤡ Minimize" : "⤢ Full screen"}</button>
                {!mixed
                  ? <button className="bl-anchor" onClick={() => { anchorNow(); setMixed(true); setFollow(true); setRecal(false); }}>Mix Now</button>
                  : <button className={"bl-anchor" + (recal ? "" : " ghost")} onClick={() => { const nx = !recal; setRecal(nx); if (nx) setFollow(false); }}>{recal ? "✓ Done" : "↔ Recalibrate"}</button>}
              </div>
            </div>
            <div className="bl-livestatus">{status}</div>
            {recal && <div className="bl-recalhint">↔ Drag a batch row to slide its cycle — line up the phase you’re actually in with the red now-line. Saves to the schedule.</div>}

            <div className="lv-wrap" ref={liveRef} onScroll={onLiveScroll}>
              <div className="lv-inner" style={{ width: LIVE_LABEL + liveSpan * LIVE_PX + 24, height: innerH }}>
                <div className="lv-axis">
                  {ticks.map((t) => <div className="lv-tick" key={t} style={{ left: LIVE_LABEL + t * LIVE_PX }}>{fmtClock(startMin + t)}</div>)}
                </div>
                {schedule.map((row, b) => {
                  const info = plan.list[b];
                  return (
                    <div className={"lv-row" + (recal ? " recal" : "")} key={b} style={{ height: rowH }}
                      onPointerDown={recal ? (e) => liveDown(e, b) : undefined} onPointerMove={recal ? liveMove : undefined}
                      onPointerUp={recal ? liveUp : undefined} onPointerCancel={recal ? liveUp : undefined}>
                      <div className="lv-label"><span className="b">B{b + 1}</span><span className="s">{info ? info.name : ""}</span></div>
                      {row.blocks.map((bl, i) => {
                        const w = bl.min * LIVE_PX;
                        const cx = LIVE_LABEL + (bl.startOff + bl.min / 2) * LIVE_PX;
                        const inside = w >= bl.name.length * 5.2 + 10;
                        return (
                          <React.Fragment key={i}>
                            <div className={"lv-bar " + (bl.active ? "a" : "p")} style={{ left: LIVE_LABEL + bl.startOff * LIVE_PX, width: Math.max(w, 2), top: barTop, height: barH }}>
                              {inside && <span className="lv-lab in">{bl.name}</span>}
                            </div>
                            {!inside && <span className="lv-lab above" style={{ left: cx, top: Math.max(1, barTop - 11) }}>{bl.name}</span>}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  );
                })}
                <div className="lv-now" style={{ left: nowX, height: innerH }}>
                  <span className="lv-nowtag">{fmtClock(nowMin)}</span>
                </div>
              </div>
            </div>
            <div className="bl-note">Live view — the red line is now, held about a third in from the left. Full screen fits all batches at once; scroll to look around; “Jump to now” re-centers. Read-only.</div>
          </div>
        );
      })()}

      {/* ---------- TAB 6: BAKE ---------- */}
      {tab === "bake" && (
        <div className="bl-panel">
          <h3>Bake — set dates on each recipe card in Plan</h3>
          <div className="bl-cond">
            <div className="bl-field2"><label>Loaves per load</label><input type="number" min="1" value={params.ovenCap ?? 2} onChange={(e) => setP("ovenCap", e.target.value)} /></div>
            <div className="bl-field2"><label>Preheat (min)</label><input type="number" min="0" value={params.preheatMin ?? 45} onChange={(e) => setP("preheatMin", e.target.value)} /></div>
            <div className="bl-field2"><label>Recover between (min)</label><input type="number" min="0" value={params.recoverMin ?? 7} onChange={(e) => setP("recoverMin", e.target.value)} /></div>
          </div>
          {types.map((t, ti) => (plan.summaries[ti] && plan.summaries[ti].loaves > 0 ? (
            <div className="bl-levparams" key={ti}>
              <span className="nm">{t.name} <em className="bl-ordbadge">bake #{t.bakeOrder || ti + 1}</em></span>
              <div className="bl-field2"><label>Bake temp (°{tempUnit})</label><input type="number" value={Math.round(cToU(t.bakeTemp ?? 245))} onChange={(e) => setDraft(ti, { bakeTemp: uToC(Number(e.target.value) || 0) })} /></div>
              <div className="bl-field2"><label>Bake time (min)</label><input type="number" min="1" value={t.bakeMin ?? 45} onChange={(e) => setDraft(ti, { bakeMin: Math.max(1, Number(e.target.value) || 0) })} /></div>
              <div className="bl-field2"><label>Steam (min)</label><input type="number" min="0" value={t.steamMin ?? 20} onChange={(e) => setDraft(ti, { steamMin: Math.max(0, Number(e.target.value) || 0) })} /></div>
            </div>
          ) : null))}

          {bakePlan.pool.length > 0 && (
            <div className="bl-pool">
              <div className="bl-pool-hd">Shaped pool — loaves across all bake dates</div>
              {bakePlan.pool.map((p) => (
                <div className={"bl-pool-row" + (p.remaining < 0 ? " over" : "")} key={p.ti}>
                  <span className="pr-nm">{p.name}</span>
                  <span className="pr-fig">{p.allocated} / {p.shaped} scheduled</span>
                  <span className={"pr-rem" + (p.remaining < 0 ? " over" : p.remaining === 0 ? " done" : "")}>{p.remaining < 0 ? `${-p.remaining} over` : p.remaining === 0 ? "all placed" : `${p.remaining} unplaced`}</span>
                </div>
              ))}
            </div>
          )}

          {bakePlan.dateSchedules.length === 0 ? (
            <div className="bl-emptytab">Add bake sessions to your recipe cards in Plan to build an oven schedule.</div>
          ) : (
            <div className="bl-date-schedules">
              {bakePlan.dateSchedules.map((ds) => {
                const bs = parseTime(bakeDateTimes[ds.date] || "08:00");
                return (
                  <div className="bl-datesect" key={ds.date}>
                    <div className="bl-datesect-hd">
                      <span className="ds-date">{ds.date}</span>
                      <div className="ss-start"><label>Oven on</label><input type="time" value={bakeDateTimes[ds.date] || "08:00"} onChange={(e) => setOvenTime(ds.date, e.target.value)} /></div>
                    </div>
                    {ds.loadCount === 0 ? <div className="bl-sessempty">No loaves for this date.</div> : (<>
                      <div className="bl-preheat">Oven on <b>{fmtClock(bs)}</b> · preheat {bakePlan.preheat} min → first load <b>{fmtClock(bs + ds.firstIn)}</b> · last out <b>{fmtClock(bs + ds.lastOut)}</b> · {fmtDur(ds.lastOut)} running · {ds.loadCount} {ds.loadCount === 1 ? "load" : "loads"} / {ds.totalLoaves} loaves</div>
                      <div className="bl-loads">
                        {ds.sched.map((ld, idx) => (
                          <React.Fragment key={idx}>
                            {idx > 0 && bakePlan.recover > 0 && <div className="bl-recover">↻ recover {bakePlan.recover} min</div>}
                            <div className="bl-load">
                              <div className="lo-no">{ld.i + 1}</div>
                              <div className="lo-body">
                                <div className="lo-hd"><span className="lo-nm">{ld.name}</span><span className="lo-n">{ld.n} {ld.n === 1 ? "loaf" : "loaves"}</span><span className="lo-temp">{showTemp(ld.temp)}</span></div>
                                <div className="lo-bar">
                                  {ld.steamMin > 0 && <div className="seg steam" style={{ flexGrow: ld.steamMin }} title="steam" />}
                                  {ld.bakeMin - ld.steamMin > 0 && <div className="seg vent" style={{ flexGrow: ld.bakeMin - ld.steamMin }} title="dry (steam released)" />}
                                </div>
                                <div className="lo-times">
                                  <span>in <b>{fmtClock(bs + ld.startOff)}</b></span>
                                  {ld.steamMin > 0 && ld.steamMin < ld.bakeMin && <span className="vent">release {fmtClock(bs + ld.ventOff)}</span>}
                                  <span>out <b>{fmtClock(bs + ld.endOff)}</b></span>
                                </div>
                              </div>
                            </div>
                          </React.Fragment>
                        ))}
                      </div>
                      {(() => {
                        const span = Math.max(30, ds.lastOut);
                        const pad = span * 0.03, lo = -pad, hi = ds.lastOut + pad, tot = hi - lo;
                        const pct = (o) => ((o - lo) / tot) * 100;
                        const step = tot > 240 ? 60 : 30;
                        const ticks = []; for (let tk = 0; tk <= ds.lastOut; tk += step) ticks.push(tk);
                        return (
                          <div className="bl-bake-gantt">
                            <div className="bg-axis">
                              {ticks.map((tk) => <div className="bg-tick" key={tk} style={{ left: pct(tk) + "%" }}><span>{fmtClock(bs + tk)}</span></div>)}
                            </div>
                            <div className="bg-preheat" style={{ left: pct(0) + "%", width: Math.max(0.5, pct(bakePlan.preheat) - pct(0)) + "%" }} title="preheat"><span>preheat</span></div>
                            {ds.sched.map((ld, idx) => {
                              const x0 = pct(ld.startOff), xv = pct(ld.ventOff), x1 = pct(ld.endOff);
                              return (
                                <div className="bg-row" key={idx}>
                                  <div className="bg-rowlabel"><b>{ld.name}</b><span>{ld.n}×</span></div>
                                  <div className="bg-track">
                                    <div className="bg-bar steam" style={{ left: x0 + "%", width: Math.max(0.4, xv - x0) + "%" }} title="steam" />
                                    {x1 > xv && <div className="bg-bar dry" style={{ left: xv + "%", width: Math.max(0.4, x1 - xv) + "%" }} title="dry" />}
                                    {ld.steamMin > 0 && ld.steamMin < ld.bakeMin && <div className="bg-vent" style={{ left: xv + "%" }} title={"steam release " + fmtClock(bs + ld.ventOff)} />}
                                  </div>
                                </div>
                              );
                            })}
                            <div className="bg-legend"><span className="bg-key steam">steam</span><span className="bg-key dry">dry</span><span className="bg-key ventk">│ release</span></div>
                          </div>
                        );
                      })()}
                    </>)}
                  </div>
                );
              })}
            </div>
          )}
          <div className="bl-note">Bake sessions are set on each recipe card in <b>Plan</b>: a date per session, loaves split across them (first session is the remainder). The Bake tab groups everything by date — if two recipes share a date, their loads are sequenced together on one oven that day. Oven-on time is set here per date. Loads don't mix recipes; one oven assumed.</div>
        </div>
      )}

      {/* ---------- TAB 7: FOOD SAFETY ---------- */}
      {tab === "safety" && (<>
        <div className="bl-panel">
          <h3>Refrigerator temperature log</h3>
          <div className="bl-fsmatrix">
            <div className="fsm-head">
              <span className="fsm-rl">Fridge</span>
              <span>Reading 1</span><span>Reading 2</span><span>Reading 3</span>
            </div>
            {foodSafety.fridges.map((fr, fi) => (
              <div className="fsm-row" key={fr.id}>
                <div className="fsm-rl">
                  <BufferedInput className="fsm-name" value={fr.name} onCommit={(v) => setFridgeName(fi, v)} placeholder="Fridge name" />
                  {foodSafety.fridges.length > 1 && <button className="ing-x" title="Remove fridge" onClick={() => removeFridge(fi)}>×</button>}
                </div>
                {fr.readings.map((r, ri) => {
                  const has = r.temp != null && r.temp !== "";
                  const safe = has && (+r.temp <= 4);
                  return (
                    <div className={"fsm-cell" + (has ? (safe ? " ok" : " bad") : "")} key={r.id}>
                      <div className="fsm-input"><input type="number" step="0.1" placeholder="—" value={has ? Math.round(cToU(+r.temp) * 10) / 10 : ""} onChange={(e) => setTempVal(fi, ri, e.target.value)} /><span>°{tempUnit}</span></div>
                      <div className="fsm-meta">
                        {r.time ? <button className="fsm-ts" title="Tap to stamp current time" onClick={() => restampTemp(fi, ri)}>{r.time}</button> : <span className="fsm-ts none">— : —</span>}
                        {has && <span className={"fsm-flag " + (safe ? "ok" : "bad")}>{safe ? "✓" : "✗"}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <button className="bl-addrec" onClick={addFridge}>+ Add fridge</button>
          <div className="bl-note">Cold-holding target is <b>4°C / 40°F or below</b>. The time stamps itself the moment you enter a reading — tap a stamp to reset it to now. Out-of-range readings flag red. Up to three readings per fridge per bake day.</div>
        </div>

        <div className="bl-panel">
          <h3>Sanitizer log</h3>
          <div className="bl-fsmatrix">
            <div className="fsm-head">
              <span className="fsm-rl">Station</span>
              <span>Reading 1</span><span>Reading 2</span><span>Reading 3</span>
            </div>
            {foodSafety.sanitizers.map((s, si) => (
              <div className="fsm-row" key={s.id}>
                <div className="fsm-rl">
                  <BufferedInput className="fsm-name" value={s.name} onCommit={(v) => setSaniName(si, v)} placeholder="Station" />
                  <span className="fsm-sub">{s.kind} · {s.min}–{s.max} ppm</span>
                  {foodSafety.sanitizers.length > 1 && <button className="ing-x" title="Remove station" onClick={() => removeSanitizer(si)}>×</button>}
                </div>
                {s.readings.map((r, ri) => {
                  const has = r.ppm != null && r.ppm !== "";
                  const pass = has && +r.ppm >= s.min && +r.ppm <= s.max;
                  return (
                    <div className={"fsm-cell" + (has ? (pass ? " ok" : " bad") : "")} key={r.id}>
                      <div className="fsm-input"><input type="number" min="0" placeholder="—" value={has ? r.ppm : ""} onChange={(e) => setSaniVal(si, ri, e.target.value)} /><span>ppm</span></div>
                      <div className="fsm-meta">
                        {r.time ? <button className="fsm-ts" title="Tap to stamp current time" onClick={() => restampSani(si, ri)}>{r.time}</button> : <span className="fsm-ts none">— : —</span>}
                        {has && <span className={"fsm-flag " + (pass ? "ok" : "bad")}>{pass ? "✓ Pass" : "✗ Fail"}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <button className="bl-addrec" onClick={addSanitizer}>+ Add station</button>
          <div className="bl-note">Chlorine sanitizer must read <b>100–200 ppm</b> to pass. The time stamps itself when you enter a reading — tap a stamp to reset it to now. Up to three readings per station per bake day.</div>
        </div>
      </>)}

      {hover && !drag && (
        <div className="bl-tip" style={{ left: hover.x, top: hover.y }}>
          <div className="b">Batch {hover.batch + 1}{hover.type ? ` · ${hover.type}` : ""}</div>
          <div className="n">{hover.name}</div>
          <div className="d">{fmtDur(hover.min)} · {fmtClock(startMin + hover.s)}–{fmtClock(startMin + hover.e)}</div>
          {hover.hit && <div className="x">⚠ collision</div>}
        </div>
      )}
      </>)}

      {delTarget && (
        <div className="bl-modal-overlay" onClick={() => setDelTarget(null)}>
          <div className="bl-modal bl-confirm" onClick={(e) => e.stopPropagation()}>
            <h3>{delTarget.kind === "day" ? "Delete bake day?" : "Delete recipe?"}</h3>
            <p>“<b>{delTarget.name || "Untitled"}</b>” will be permanently removed. This can’t be undone.</p>
            <div className="bl-confirm-acts">
              <button className="bl-confirm-cancel" onClick={() => setDelTarget(null)}>Cancel</button>
              <button className="bl-confirm-del" onClick={() => { if (delTarget.kind === "day") delDay(delTarget.id); else if (delTarget.kind === "remix") deleteRemix(delTarget.id); else deleteCoreRecipe(delTarget.id); setDelTarget(null); }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>

    {labelOpen && (() => {
      const P = AVERY_6468;
      const data = (plan.list || []).map((b, i) => {
        const t = types[b.ti];
        return { n: i + 1, name: t.name, size: b.size, dough: b.dough, lines: ingLines(t).filter((l) => l.pct > 0).map((l) => ({ name: l.name, g: b.weights[l.key] })) };
      });
      const per = P.cols * P.rows;
      const sheets = [];
      for (let i = 0; i < data.length; i += per) sheets.push(data.slice(i, i + per));
      if (sheets.length === 0) sheets.push([]);
      const sheetStyle = { width: P.pageW + "in", height: P.pageH + "in", boxSizing: "border-box", paddingTop: `calc(${P.top}in + ${labelOffY}mm)`, paddingLeft: `calc(${P.left}in + ${labelOffX}mm)` };
      const gridStyle = { display: "grid", gridTemplateColumns: `repeat(${P.cols}, ${P.labelW}in)`, gridAutoRows: `${P.labelH}in`, columnGap: `${P.hGut}in`, rowGap: `${P.vGut}in` };
      return (
        <div className="label-print-overlay">
          <div className="label-print-ui">
            <div className="lpu-title">Bucket labels<small>Avery 6468 · 2&quot;×4&quot; · {data.length} label{data.length === 1 ? "" : "s"} · {sheets.length} sheet{sheets.length === 1 ? "" : "s"}</small></div>
            <label className="lpu-ctl sm">Nudge&nbsp;→<input type="number" step="0.5" value={labelOffX} onChange={(e) => setLabelOffX(+e.target.value || 0)} /><em>mm</em></label>
            <label className="lpu-ctl sm">Nudge&nbsp;↓<input type="number" step="0.5" value={labelOffY} onChange={(e) => setLabelOffY(+e.target.value || 0)} /><em>mm</em></label>
            <div className="lpu-spacer" />
            <button className="lpu-print" onClick={() => window.print()}>Print / Save PDF</button>
            <button className="lpu-close" onClick={() => setLabelOpen(false)} aria-label="Close">×</button>
          </div>
          <div className="label-print-hint">Set the print dialog to <b>100% scale</b> and <b>margins: None</b>. Run one test sheet on plain paper held against a label sheet; if it's off, nudge in mm above.</div>
          <div className="label-stage">
            <div className="label-sheets">
              {sheets.map((sheet, si) => (
                <div className="label-sheet" key={si} style={sheetStyle}>
                  <div style={gridStyle}>
                    {sheet.map((L) => (
                      <div className="label-cell" key={L.n}>
                        <div className="lc-left">
                          <span className="lc-n">B{L.n}</span>
                          <span className="lc-name">{L.name}</span>
                        </div>
                        <div className="lc-right">
                          <div className="lc-lines">
                            {L.lines.map((ln, j) => <div className="lc-line" key={j}><span className="lc-ing">{ln.name}</span><span className="lc-g">{fmtG(ln.g)} g</span></div>)}
                          </div>
                          <div className="lc-foot">{L.size} loaves · {fmtG(L.dough)} g dough</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
}
