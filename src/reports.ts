import PDFDocument from "pdfkit";
import db from "./db.js";
import { valuatePortfolio, orgMethod } from "./service.js";
import { lastAsOf } from "./prices.js";

function fmt(n: string, dp = 2): string {
  const v = Number(n);
  return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
const csvCell = (s: string | number) => {
  const v = String(s);
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

interface ReportMeta { portfolioId: string; method?: string; currency?: string; }

function load(meta: ReportMeta) {
  const p = db.prepare("SELECT * FROM portfolios WHERE id=?").get(meta.portfolioId) as any;
  if (!p) throw new Error("portfolio not found");
  const method = (meta.method as any) || orgMethod(p.org_id);
  const ccy = meta.currency || p.base_currency || "USD";
  const val = valuatePortfolio(meta.portfolioId, method, ccy);
  return { p, method, ccy, val };
}

/** Holdings statement as CSV (positions + totals footer). */
export function portfolioCsv(meta: ReportMeta): string {
  const { p, method, ccy, val } = load(meta);
  const head = ["Asset", "Symbol", "Quantity", "Avg cost", `Price (${ccy})`, `Market value (${ccy})`, `Cost basis (${ccy})`, "Unrealized P/L", "Unrealized %", "Realized P/L", "Allocation %", "24h %"];
  const lines = [
    `# CryptoTrack Biz — Holdings statement`,
    `# Portfolio,${csvCell(p.name)}`,
    `# Method,${method}`,
    `# Priced at,${lastAsOf() ?? "n/a"}`,
    head.map(csvCell).join(","),
  ];
  for (const pos of val.positions) {
    lines.push([
      pos.name, pos.symbol, pos.qty, fmt(pos.avgCost), fmt(pos.price), fmt(pos.marketValue),
      fmt(pos.costBasis), fmt(pos.unrealizedPnL), fmt(pos.unrealizedPct), fmt(pos.realizedPnL),
      fmt(pos.allocationPct), fmt(pos.change24hPct ?? "0"),
    ].map(csvCell).join(","));
  }
  lines.push(["TOTAL", "", "", "", "", fmt(val.totals.marketValue), fmt(val.totals.costBasis),
    fmt(val.totals.unrealizedPnL), fmt(val.totals.unrealizedPct), fmt(val.totals.realizedPnL), "100.00", ""]
    .map(csvCell).join(","));
  return lines.join("\n");
}

/** Holdings statement as a branded PDF buffer. */
export function portfolioPdf(meta: ReportMeta): Promise<Buffer> {
  const { p, method, ccy, val } = load(meta);
  const doc = new PDFDocument({ size: "A4", margin: 44 });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const ink = "#0f1729", teal = "#0d9488", muted = "#64748b";
  doc.fillColor(ink).font("Helvetica-Bold").fontSize(20).text("CryptoTrack Biz");
  doc.font("Helvetica").fontSize(10).fillColor(muted).text("Treasury holdings statement");
  doc.moveDown(0.8);
  doc.fillColor(ink).font("Helvetica-Bold").fontSize(13).text(p.name);
  doc.font("Helvetica").fontSize(9).fillColor(muted)
    .text(`Cost basis method: ${method}    Currency: ${ccy}    Priced: ${lastAsOf() ?? "n/a"}`);
  doc.moveDown(0.6);

  // Totals band
  const band = doc.y;
  doc.roundedRect(44, band, 507, 52, 6).fill("#f1f5f9");
  doc.fillColor(muted).font("Helvetica").fontSize(8);
  doc.text("MARKET VALUE", 60, band + 9); doc.text("COST BASIS", 220, band + 9); doc.text("UNREALIZED P/L", 380, band + 9);
  doc.fillColor(ink).font("Helvetica-Bold").fontSize(14);
  doc.text(`${fmt(val.totals.marketValue)} ${ccy}`, 60, band + 22);
  doc.text(`${fmt(val.totals.costBasis)} ${ccy}`, 220, band + 22);
  const upl = Number(val.totals.unrealizedPnL);
  doc.fillColor(upl >= 0 ? teal : "#dc2626").text(`${upl >= 0 ? "+" : ""}${fmt(val.totals.unrealizedPnL)}`, 380, band + 22);
  doc.y = band + 68;

  // Table
  const cols = [44, 150, 230, 320, 410, 500];
  const header = ["Asset", "Qty", "Price", "Market value", "Unreal. P/L", "Alloc%"];
  doc.fillColor(muted).font("Helvetica-Bold").fontSize(8);
  header.forEach((h, i) => doc.text(h, cols[i], doc.y, { continued: i < header.length - 1, width: (cols[i + 1] ?? 551) - cols[i] - 4 }));
  doc.moveDown(0.5);
  doc.font("Helvetica").fontSize(9).fillColor(ink);
  for (const pos of val.positions) {
    const y = doc.y;
    const u = Number(pos.unrealizedPnL);
    doc.fillColor(ink).text(`${pos.symbol}`, cols[0], y);
    doc.text(fmt(pos.qty, 6), cols[1], y);
    doc.text(fmt(pos.price), cols[2], y);
    doc.text(fmt(pos.marketValue), cols[3], y);
    doc.fillColor(u >= 0 ? teal : "#dc2626").text(`${u >= 0 ? "+" : ""}${fmt(pos.unrealizedPnL)}`, cols[4], y);
    doc.fillColor(ink).text(fmt(pos.allocationPct), cols[5], y);
    doc.moveDown(0.4);
  }
  doc.moveDown(1).fontSize(7.5).fillColor(muted)
    .text("Non-custodial analytical report. Prices sourced from public market data and may be delayed. Not investment advice.", { width: 507 });
  doc.end();
  return done;
}
