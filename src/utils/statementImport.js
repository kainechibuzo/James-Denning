// Statement-file parsing for the cash-flow reconciliation import.
// Replaces the unmaintained npm `xlsx` package (SheetJS 0.18.5, unpatched
// prototype-pollution and ReDoS advisories). Supports:
//   .csv  — parsed directly (quoted fields, escaped quotes, BOM tolerated)
//   .xlsx — parsed with ExcelJS
// Legacy binary .xls files are rejected explicitly: they must be re-saved as .xlsx or .csv.

const normalizeHeader = (value) => String(value ?? "").trim().toLowerCase().replace(/[ _\-]+/g, "");

const cellText = (value) => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("");
    if (value.text !== undefined) return String(value.text); // hyperlink cells
    if (value.result !== undefined) return cellText(value.result); // formula cells
    if (value.error) return ""; // e.g. #N/A
    if (value.sharedString !== undefined) return String(value.sharedString);
    return String(value);
  }
  return String(value);
};

const parseCsv = (text) => {
  const src = text.replace(/^\uFEFF/, "");
  const rows = [];
  let field = "", row = [], inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === "," || ch === ";" || ch === "\t") { row.push(field); field = ""; continue; }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  if (inQuotes) throw new Error("The CSV file has an unterminated quoted field.");
  row.push(field);
  if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
  return rows;
};

const rowsToObjects = (table) => {
  if (!table.length) return [];
  const headers = table[0].map((cell) => String(cell ?? "").trim());
  return table.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      if (header) record[header] = cells[index] ?? "";
    });
    return record;
  });
};

// Normalise a user-typed date cell to ISO YYYY-MM-DD. Day-first parsing is used for
// slash/dash separated dates (the product's primary market uses DD/MM/YYYY).
export const normaliseStatementDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value ?? "").trim();
  if (!text) return "";
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const dayFirst = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dayFirst) {
    const day = Number(dayFirst[1]), month = Number(dayFirst[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${dayFirst[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text.slice(0, 10) : parsed.toISOString().slice(0, 10);
};

// Parse a bank statement file into an array of header-keyed row objects.
// Throws with a user-readable message when the format is not supported.
export const parseStatementFile = async (file) => {
  const name = String(file?.name || "statement").toLowerCase();
  if (/\.xls$/.test(name)) {
    throw new Error("Legacy .xls files are no longer supported. Please re-save the statement as .xlsx or .csv and try again.");
  }
  if (/\.csv$/.test(name) || file.type === "text/csv") {
    const table = parseCsv(await file.text());
    return rowsToObjects(table);
  }
  if (/\.xlsx$/.test(name) || /spreadsheetml\.sheet$/.test(file.type || "")) {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error("No worksheet was found in the workbook.");
    const table = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      const cells = values.map((cell) => cellText(cell));
      if (cells.some((cell) => String(cell).trim() !== "")) table.push(cells);
    });
    return rowsToObjects(table);
  }
  throw new Error("Unsupported statement format. Upload a .csv or .xlsx bank statement.");
};

// Map a parsed header-keyed row to the reconciliation payload shape shared by CSV and XLSX.
export const toStatementRow = (raw) => {
  const m = {};
  for (const [key, value] of Object.entries(raw)) m[normalizeHeader(key)] = value;
  const rawDate = m.date ?? m.transactiondate ?? m.occurredon ?? m.valuedate;
  const occurred = normaliseStatementDate(rawDate);
  let direction = String(m.direction ?? m.type ?? "").trim().toLowerCase();
  const debit = Number(String(m.debit ?? 0).replace(/,/g, "")) || 0;
  const credit = Number(String(m.credit ?? 0).replace(/,/g, "")) || 0;
  if (!["inflow", "outflow"].includes(direction)) {
    direction = credit > 0 ? "inflow" : debit > 0 ? "outflow" : "";
    if (direction) m.amount = credit > 0 ? credit : debit;
  }
  const amount = Number(String(m.amount ?? "").toString().replace(/,/g, ""));
  return {
    occurred_on: occurred,
    direction,
    amount: Number.isFinite(amount) ? amount : 0,
    currency: String(m.currency || "NGN").trim().toUpperCase(),
    reference: String(m.reference ?? m.transactionreference ?? "").trim(),
    description: String(m.description ?? m.narration ?? "").trim(),
  };
};
