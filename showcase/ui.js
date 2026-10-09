// Shared by the showcase's pages (index.html, results.html): Outis's icons, logo and formatting,
// and the label scores are grouped by. Classic script: the apps load the pages from files.
window.OUTIS_UI = (function () {
  // Outis's line icons (packages/ui/src/Icon.tsx), and a few more in the same style.
  const ICONS = {
    pay: '<path d="M7 17 17 7M8 7h9v9"/>',
    shieldDown: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6Z"/><path d="M12 8.5v7m-3-3 3 3 3-3"/>',
    shieldUp: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6Z"/><path d="M12 15.5v-7m-3 3 3-3 3 3"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6Z"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/>',
    eye: '<path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M10.6 5.1A9 9 0 0 1 12 5c6 0 9.5 7 9.5 7a16 16 0 0 1-2.4 3.3M6.6 6.6C3.9 8.3 2.5 12 2.5 12S6 19 12 19a9 9 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/>',
    back: '<path d="m15 5-7 7 7 7"/>',
    next: '<path d="m9 5 7 7-7 7"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 9.2-9.2m-3 3 2.5 2.5M14 9l2 2"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.3M12 17h.01"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
    warn: '<path d="M10.3 4a2 2 0 0 1 3.4 0l7.1 12.5a2 2 0 0 1-1.7 3H4.9a2 2 0 0 1-1.7-3Z"/><path d="M12 9v4m0 3h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
    danger: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
    share: '<path d="M12 15V4m-4 4 4-4 4 4"/><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    again: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>',
    phone: '<rect x="6.5" y="3" width="11" height="18" rx="2.5"/><path d="M10.5 18h3"/>',
    proof: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13.5l2 2 4-4.5"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>',
    upload: '<path d="M12 16V4m-4 4 4-4 4 4"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    network: '<circle cx="12" cy="5" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="M11 6.8 6 16.2M13 6.8l5 9.4M7 18h10"/>',
  };
  const icon = (name, extra = "") => `<svg class="i ${extra}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  const spinner = '<svg class="spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.3" stroke-width="2.5"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
  const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // Outis's mark and name (packages/ui/src/brand.ts).
  const MARK = "M499.2 230H407.74C278.77 230 250 98.37 250 97.37C250 98.37 221.23 230 92.26 230H0.8A250 250 0 0 1 499.2 230ZM499.2 270A250 250 0 0 1 0.8 270H92.26C221.23 270 250 401.63 250 402.63C250 401.63 278.77 270 407.74 270Z";
  const WORDMARK = "M264.99 142.14Q251 142.14 239.38 135.99Q227.75 129.84 220.83 117.76Q213.91 105.69 213.91 87.95Q213.91 74.6 217.98 64.48Q222.05 54.35 229.21 47.47Q236.38 40.59 245.56 37.14Q254.75 33.69 264.99 33.69Q279.01 33.69 290.62 39.82Q302.23 45.95 309.14 58.03Q316.06 70.1 316.06 87.95Q316.06 105.69 309.26 117.76Q302.45 129.84 290.9 135.99Q279.35 142.14 264.99 142.14ZM264.99 124.1Q274.33 124.1 281 119.62Q287.68 115.14 291.27 107Q294.88 98.86 294.88 87.95Q294.88 76.93 291.27 68.79Q287.68 60.65 281 56.19Q274.33 51.73 264.99 51.73Q255.65 51.73 248.98 56.24Q242.3 60.76 238.7 68.9Q235.1 77.04 235.1 87.95Q235.1 98.86 238.7 107Q242.3 115.14 248.98 119.62Q255.65 124.1 264.99 124.1ZM367.96 141.73Q355.03 141.73 347.64 137.07Q340.25 132.43 337.27 124.21Q334.29 116 334.29 105.24L334.29 61.4L353.86 61.4L353.86 102.46Q353.86 110.49 355.29 115.44Q356.71 120.39 360.14 122.66Q363.58 124.93 369.35 124.93Q372.73 124.93 375.97 124.59Q379.21 124.25 381.16 123.91L381.16 61.4L400.7 61.4L400.7 137.3Q395.3 138.84 386.66 140.28Q378.01 141.73 367.96 141.73ZM452 141.76Q440.41 141.76 433.87 137.69Q427.33 133.63 424.72 126.16Q422.11 118.7 422.11 108.46L422.11 41.04L441.69 37.85L441.69 61.4L469.44 61.4L469.44 77.71L441.69 77.71L441.69 108.46Q441.69 114.01 442.94 117.74Q444.2 121.48 447.11 123.28Q450.01 125.08 454.92 125.08Q459.05 125.08 462.88 124.23Q466.7 123.39 469.63 122.23L472.59 137.56Q468.99 139.14 463.98 140.45Q458.98 141.76 452 141.76ZM487.48 140L487.48 61.4L507.05 61.4L507.05 140L487.48 140ZM497.34 47.3Q492.46 47.3 488.9 44.09Q485.34 40.89 485.34 35.34Q485.34 29.83 488.9 26.62Q492.46 23.41 497.34 23.41Q502.21 23.41 505.78 26.62Q509.34 29.83 509.34 35.34Q509.34 40.89 505.78 44.09Q502.21 47.3 497.34 47.3ZM550.21 142.03Q539.83 142.03 533.19 140.24Q526.55 138.46 524.04 137.34L527.53 121.25Q532.21 123.09 537.99 124.53Q543.76 125.98 550.33 125.98Q557 125.98 560.19 124.44Q563.38 122.9 563.38 118.74Q563.38 116.38 561.8 114.69Q560.22 113 557.04 111.35Q553.85 109.7 548.75 107.79Q542.11 105.16 536.94 102.24Q531.76 99.31 528.86 94.72Q525.95 90.13 525.95 82.74Q525.95 75.5 529.59 70.31Q533.22 65.11 539.92 62.24Q546.61 59.38 555.91 59.38Q563.26 59.38 569.56 60.67Q575.86 61.96 579.35 63.35L575.79 78.84Q572.38 77.56 567.86 76.42Q563.34 75.28 557.08 75.28Q551.56 75.28 548.43 77Q545.3 78.72 545.3 82.4Q545.3 84.65 546.46 86.34Q547.63 88.03 550.51 89.53Q553.4 91.03 558.54 92.94Q567.58 96.28 572.86 99.67Q578.15 103.06 580.51 107.58Q582.88 112.1 582.88 118.85Q582.88 126.46 579.05 131.62Q575.22 136.78 567.93 139.4Q560.64 142.03 550.21 142.03Z";
  const logo = `<svg class="logo" viewBox="0 0 620 176" role="img" aria-label="Outis"><path class="mark" transform="translate(8 8) scale(.32)" d="${MARK}"/><path class="name" d="${WORDMARK}"/></svg>`;

  // Formatting for people, not engineers. [STRK] is a shielded amount, as in Outis.
  const seconds = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${s.toFixed(1)} s`);
  const clockParts = (s) => (s >= 60 ? [`${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`, "min"] : [s.toFixed(1), "s"]);
  const gigabytes = (mib) => (mib / 1024).toFixed(1);
  const integer = (n) => Number(n).toLocaleString("en-US");
  // Browsers other than Chrome don't tell the RAM (ramGiB null): then it is left out.
  const nominalRam = (gib) => (gib ? [2, 3, 4, 6, 8, 12, 16, 18, 24, 32, 36, 48, 64, 96, 128].find((size) => size >= gib * 0.93) || Math.round(gib) : null);
  // "12 GB", or "32+ GB" where the figure is only a lower bound (a browser's deviceMemory).
  const ramLabel = (dev) => { const gb = dev && nominalRam(dev.ramGiB); return gb ? `${gb}${dev.ramAtLeast ? "+" : ""} GB` : null; };

  // What the results group by: the device's name in the apps; in a browser the phone's model
  // (Chrome on Android tells it), else the chip its GPU names, else OS, architecture and cores,
  // then the browser.
  function deviceLabel(device, deviceNames) {
    if (!device) return "Unknown device";
    if (device.platform !== "web") return deviceNames[device.model] || device.name || device.model;
    const hardware = device.hardware ? deviceNames[device.hardware] || device.hardware : null;
    const chip = gpuChip(device.gpu);
    const base = hardware || chip || [device.os, device.arch, device.cores ? `${device.cores}-core` : ""].filter(Boolean).join(" ");
    const browser = (device.name || "").split(" on ")[0];
    return browser ? `${base} · ${browser}` : base;
  }

  // The chip a GPU name gives away: Apple silicon on a Mac, and phone GPUs (their SoC's).
  function gpuChip(gpu) {
    if (!gpu) return null;
    const apple = gpu.match(/Apple (M\d+(?: Pro| Max| Ultra)?)/);
    if (apple) return `Apple ${apple[1]}`;
    const mobile = gpu.match(/(Adreno|Mali|Immortalis|Xclipse|PowerVR)[^,)]*/);
    return mobile ? mobile[0].replace(/\s*\(TM\)\s*/g, " ").trim() : null;
  }

  return { ICONS, icon, spinner, escape, logo, seconds, clockParts, gigabytes, integer, nominalRam, ramLabel, deviceLabel, gpuChip };
})();
