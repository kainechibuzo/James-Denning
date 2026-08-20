/**
 * Grade helpers — pure functions with no React or theme dependency.
 *
 * Used by:  AppDemo.jsx (result tables), report card generator,
 *           transcript builder, broadsheet builder.
 */

/** Default fallback grading schema — overridden per-school from DB. */
export const GRADES = [
  { min:70, max:100, grade:"A",  remark:"Excellent"   },
  { min:60, max:69,  grade:"B",  remark:"Very Good"   },
  { min:50, max:59,  grade:"C",  remark:"Good"        },
  { min:45, max:49,  grade:"D",  remark:"Pass"        },
  { min:40, max:44,  grade:"E",  remark:"Fair"        },
  { min:0,  max:39,  grade:"F",  remark:"Fail"        },
];

/**
 * Return the grade letter for a numeric score.
 * @param {number|string|null} n      Score (integer or decimal)
 * @param {Array}              schema Custom grading schema from DB (optional)
 */
export const getGrade = (n, schema) => {
  if (n == null || n === "") return "–";
  const src = schema?.length ? schema : GRADES;
  // Math.floor so decimal averages (e.g. 59.4) don't fall between integer boundaries
  const v = Math.floor(+n);
  const g = src.find(
    g => v >= +(g.min ?? g.min_score ?? 0) && v <= +(g.max ?? g.max_score ?? 100)
  );
  return g ? g.grade : "–";
};

/**
 * Return the remark string for a numeric score.
 */
export const getRemark = (n, schema) => {
  if (n == null || n === "") return "–";
  const src = schema?.length ? schema : GRADES;
  const v = Math.floor(+n);
  const g = src.find(
    g => v >= +(g.min ?? g.min_score ?? 0) && v <= +(g.max ?? g.max_score ?? 100)
  );
  return g ? g.remark : "–";
};

/**
 * Return a CSS colour token (from the current theme) for a grade letter.
 * Depends on the live `C` theme reference — import C from config/theme.
 * Call site: `gradeCol(grade, C)`
 */
export const gradeCol = (g, C) =>
  g === "A" ? C.green :
  g === "B" ? C.blue  :
  g === "C" ? C.orange :
  g === "F" ? C.red   : C.muted;

// ── Member name formatting ────────────────────────────────────────────────
/** Mutable settings — updated by setNameSettings() from organization settings. */
export let _nameSettings = { order: "FML", casing: "title" };
export const setNameSettings = (s = {}) => {
  _nameSettings = { ..._nameSettings, ...s };
};

export const _applyNameCase = (str, casing) => {
  if (!str || str === "—") return str;
  if (casing === "upper") return str.toUpperCase();
  if (casing === "lower") return str.toLowerCase();
  // title (default)
  return str.split(" ").map(w => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : "")).join(" ");
};

/**
 * Build a student's display name respecting the school's name_order / name_case setting.
 */
export const fullName = s => {
  const parts =
    _nameSettings.order === "LFM"
      ? [s.last_name, s.first_name, s.middle_name]
      : [s.first_name, s.middle_name, s.last_name];
  const raw = parts.filter(Boolean).join(" ") || s.name || "—";
  if (raw === "—") return raw;
  return _applyNameCase(raw, _nameSettings.casing || "title");
};

// ── Currency formatter ─────────────────────────────────────────────────────
/** Naira currency formatter. e.g. fmt(50000) → "₦50,000" */
export const fmt = n => "₦" + Number(n || 0).toLocaleString();
