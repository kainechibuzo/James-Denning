/**
 * Evaluate the arithmetic-only formula language used by CAE totals.
 * No JavaScript evaluation, property access, function calls or identifiers.
 */
export function evaluateArithmeticExpression(source) {
  if (typeof source !== "string" || source.length > 512) return null;
  let index = 0;
  let operations = 0;
  let depth = 0;
  let invalid = false;

  const skipSpace = () => {
    while (/\s/.test(source[index] || "")) index += 1;
  };
  const countOperation = () => {
    operations += 1;
    if (operations > 256) invalid = true;
  };
  const primary = () => {
    skipSpace();
    if (source[index] === "+" || source[index] === "-") {
      const sign = source[index++] === "-" ? -1 : 1;
      countOperation();
      return sign * primary();
    }
    if (source[index] === "(") {
      depth += 1;
      if (depth > 64) { invalid = true; return 0; }
      index += 1;
      const value = expression();
      skipSpace();
      if (source[index] !== ")") invalid = true;
      else index += 1;
      depth -= 1;
      return value;
    }
    const match = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (!match) { invalid = true; return 0; }
    index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) invalid = true;
    return value;
  };
  const term = () => {
    let value = primary();
    while (!invalid) {
      skipSpace();
      const operator = source[index];
      if (operator !== "*" && operator !== "/") break;
      index += 1;
      countOperation();
      const right = primary();
      if (operator === "/" && right === 0) { invalid = true; return 0; }
      value = operator === "*" ? value * right : value / right;
      if (!Number.isFinite(value)) invalid = true;
    }
    return value;
  };
  const expression = () => {
    let value = term();
    while (!invalid) {
      skipSpace();
      const operator = source[index];
      if (operator !== "+" && operator !== "-") break;
      index += 1;
      countOperation();
      const right = term();
      value = operator === "+" ? value + right : value - right;
      if (!Number.isFinite(value)) invalid = true;
    }
    return value;
  };

  const result = expression();
  skipSpace();
  return invalid || index !== source.length || !Number.isFinite(result) ? null : result;
}
