// Skala 5 kelas, ramah buta warna dan tidak mencolok: sekuensial teal→biru dan divergen biru↔amber.
export const SEQ5 = ["#e8f4f1", "#b4dccd", "#68bcb0", "#31879f", "#1d5084"];
export const DIV5 = ["#3a76b4", "#9bbfe0", "#eef0ec", "#f1cd92", "#d98f43"];

export interface Scale {
  colors: string[];           // 5 warna
  breaks: number[];           // 6 batas: kelas i = [breaks[i], breaks[i+1])
  color: (v: number) => string;
  diverging: boolean;
  name: string;
}

function quantile(sorted: number[], p: number) {
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** Kelas berbasis kuantil (sekuensial) atau selang simetris (selisih) agar 5 warna terpakai merata. */
export function makeScale(values: number[], diverging: boolean): Scale {
  if (!values.length) return { colors: SEQ5, breaks: [0, 0, 0, 0, 0, 0], color: () => SEQ5[0], diverging, name: "" };
  let breaks: number[];
  let colors = SEQ5;
  if (diverging) {
    const s = [...values].map(Math.abs).sort((a, b) => a - b);
    const m = quantile(s, 0.98) || 1;
    breaks = [-m, -0.6 * m, -0.2 * m, 0.2 * m, 0.6 * m, m];
    colors = DIV5;
  } else {
    const s = [...values].sort((a, b) => a - b);
    breaks = [0, 0.2, 0.4, 0.6, 0.8, 1].map((p) => quantile(s, p));
  }
  const color = (v: number) => {
    let k = 0;
    for (let i = 1; i < 5; i++) if (v >= breaks[i]) k = i;
    return colors[k];
  };
  return { colors, breaks, color, diverging, name: diverging ? "Biru–amber (selisih)" : "Teal–biru (kuantil)" };
}
export const NO_DATA = "#cfd6e0";
