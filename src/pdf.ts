import { jsPDF } from 'jspdf';
import { db, type Student, type Scale, type Rating, type Note } from './db';

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  // h in [0, 360], s,l in [0,1]
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const rr = Math.round((r + m) * 255);
  const gg = Math.round((g + m) * 255);
  const bb = Math.round((b + m) * 255);
  return [rr, gg, bb];
}

function hueForPercent(pct: number) {
  // 0..100 => hue 220..0, saturation 0.8, lightness 0.5
  const hue = 220 - (220 * pct) / 100;
  const [r, g, b] = hslToRgb(hue, 0.8, 0.5);
  return { r, g, b, hue };
}

function computePercent(value: number, min: number, max: number) {
  if (max === min) return 0;
  const v = Math.max(min, Math.min(max, value));
  return ((v - min) / (max - min)) * 100;
}

function drawBar(doc: jsPDF, x: number, y: number, w: number, h: number, pct: number) {
  // background
  doc.setDrawColor(220, 220, 220);
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(x, y, w, h, 1, 1, 'FD');
  // fill
  const { r, g, b } = hueForPercent(pct);
  const ww = Math.max(0, Math.min(w, (w * pct) / 100));
  doc.setFillColor(r, g, b);
  doc.roundedRect(x, y, ww, h, 1, 1, 'F');
}

function drawSparkline(doc: jsPDF, x: number, y: number, w: number, h: number, points: { t: number; v: number }[], min: number, max: number) {
  // Frame
  doc.setDrawColor(200, 200, 200);
  doc.rect(x, y, w, h);
  if (points.length < 2) return;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const dt = Math.max(1, t1 - t0);
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  let prevX = x;
  let prevY = y + h - ((clamp(points[0].v) - min) / (max - min)) * h;
  doc.setDrawColor(14, 165, 233); // brand blue
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const xx = x + ((p.t - t0) / dt) * w;
    const yy = y + h - ((clamp(p.v) - min) / (max - min)) * h;
    doc.line(prevX, prevY, xx, yy);
    prevX = xx; prevY = yy;
  }
}

export async function generateStudentPDF(studentId: number) {
  const [student, scales, ratings, notes] = await Promise.all([
    db.students.get(studentId),
    db.scales.orderBy('sort_index').toArray(),
    db.ratings.where('student_id').equals(studentId).sortBy('recorded_at'),
    db.notes.where('student_id').equals(studentId).reverse().sortBy('recorded_at'),
  ]);
  if (!student) throw new Error('Student not found');

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 12;
  let y = margin;

  // Header
  doc.setFontSize(16);
  doc.text(`${student.first_name} ${student.last_name}`, margin, y);
  doc.setFontSize(11);
  y += 6;
  doc.text(`Class: ${student.class_name}    Number: ${student.number}`, margin, y);
  y += 8;

  // Scales table header
  doc.setFontSize(12);
  doc.text('Scales', margin, y);
  y += 4;

  const rowH = 9;
  const barW = 80;
  const barH = 5;
  const sparkW = 50;
  const sparkH = 14;
  const colLabelW = 50;
  for (const sc of scales) {
    const min = sc.min ?? -3;
    const max = sc.max ?? 3;
    // latest value
    const rv = ratings.filter((r) => r.scale_id === sc.id);
    const latest = rv.length ? rv[rv.length - 1].value : 0;
    const pct = computePercent(latest, min, max);
    // labels
    doc.setFontSize(10);
    doc.text(`${sc.left_label} ↔ ${sc.right_label}`, margin, y + 4);
    // bar
    drawBar(doc, margin + colLabelW, y + 1.5, barW, barH, pct);
    doc.setFontSize(10);
    doc.text(`${pct.toFixed(0)}%`, margin + colLabelW + barW + 4, y + 5);
    // sparkline last 30 days
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const pts = rv.filter((r) => r.recorded_at >= since).map((r) => ({ t: r.recorded_at, v: r.value }));
    if (pts.length > 1) {
      drawSparkline(doc, margin + colLabelW + barW + 20, y + 1, sparkW, sparkH, pts, min, max);
    }
    y += rowH;
    if (y > 270) { doc.addPage(); y = margin; }
  }

  // Notes summary
  y += 2;
  doc.setFontSize(12);
  doc.text('Notes (recent)', margin, y);
  y += 4;
  doc.setFontSize(10);
  const maxNotes = 8;
  for (const n of notes.slice(0, maxNotes)) {
    const ts = new Date(n.recorded_at).toLocaleString();
    const tags = (n.tags || []).join(', ');
    const text = tags ? `[${tags}] ${n.text}` : n.text;
    const wrapped = doc.splitTextToSize(`${ts} — ${text}`, 185 - margin);
    doc.text(wrapped as unknown as string, margin, y);
    y += (wrapped as string[]).length * 5 + 1;
    if (y > 280) { doc.addPage(); y = margin; }
  }

  doc.save(`student-${studentId}.pdf`);
}

export async function generateClassSummaryPDF(className: string) {
  const [students, scales, ratings] = await Promise.all([
    db.students.where('class_name').equals(className).toArray(),
    db.scales.orderBy('sort_index').toArray(),
    db.ratings.toArray(),
  ]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 12;
  let y = margin;

  doc.setFontSize(16);
  doc.text(`Class Summary — ${className}`, margin, y);
  y += 8;

  // Averages table
  doc.setFontSize(12);
  doc.text('Averages', margin, y);
  y += 5;

  const tableColLabel = 90;
  const tableBarW = 80;
  const tableRowH = 8;

  for (const sc of scales) {
    const min = sc.min ?? -3;
    const max = sc.max ?? 3;
    // latest values per student for this scale
    const values: number[] = [];
    for (const s of students) {
      const rs = ratings.filter((r) => r.student_id === s.id && r.scale_id === sc.id);
      if (rs.length) values.push(rs[rs.length - 1].value);
    }
    const avgPct = values.length ? values.reduce((a, b) => a + computePercent(b, min, max), 0) / values.length : 0;
    doc.setFontSize(10);
    doc.text(`${sc.left_label} ↔ ${sc.right_label}`, margin, y + 4);
    drawBar(doc, margin + tableColLabel, y + 1.5, tableBarW, 5, avgPct);
    doc.text(`${avgPct.toFixed(0)}%`, margin + tableColLabel + tableBarW + 4, y + 5);
    y += tableRowH;
    if (y > 250) { doc.addPage(); y = margin; }
  }

  // Heatmap thumbnail (students x scales)
  y += 4;
  doc.setFontSize(12);
  doc.text('Heatmap', margin, y);
  y += 3;
  const cellSize = 3; // mm
  const gridW = Math.min(180, scales.length * cellSize);
  const gridH = Math.min(100, students.length * cellSize);
  const cols = Math.min(scales.length, Math.floor(gridW / cellSize));
  const rows = Math.min(students.length, Math.floor(gridH / cellSize));
  const startX = margin;
  const startY = y;
  for (let ri = 0; ri < rows; ri++) {
    const s = students[ri];
    for (let ci = 0; ci < cols; ci++) {
      const sc = scales[ci];
      const rs = ratings.filter((r) => r.student_id === s.id && r.scale_id === sc.id);
      let pct = 0;
      if (rs.length) {
        const min = sc.min ?? -3;
        const max = sc.max ?? 3;
        pct = computePercent(rs[rs.length - 1].value, min, max);
      }
      const { r, g, b } = hueForPercent(pct);
      doc.setFillColor(r, g, b);
      doc.rect(startX + ci * cellSize, startY + ri * cellSize, cellSize, cellSize, 'F');
    }
  }
  // border
  doc.setDrawColor(180, 180, 180);
  doc.rect(startX, startY, cols * cellSize, rows * cellSize);

  doc.save(`class-${className}.pdf`);
}

