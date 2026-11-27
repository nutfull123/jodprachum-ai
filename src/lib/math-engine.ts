export type AngleMode = "deg" | "rad";

export type MathEvalResult =
  | {
      ok: true;
      normalized: string;
      value: number;
      formatted: string;
      solvedVariable?: string;
    }
  | {
      ok: false;
      error: string;
    };

type Token =
  | { kind: "num"; value: number }
  | { kind: "id"; name: string }
  | { kind: "op"; op: "+" | "-" | "*" | "/" | "%" | "^" | "!" }
  | { kind: "lparen" }
  | { kind: "rparen" };

function normalizeMathExpression(raw: string): string {
  return raw
    .trim()
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/π/gi, "pi")
    .replace(/√\s*\(/g, "sqrt(")
    .replace(/√\s*([0-9a-zA-Z.]+)/g, "sqrt($1)")
    .replace(/,/g, "");
}

function tokenizeMath(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const start = i;
      let hasDot = ch === ".";
      i += 1;
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        if (expr[i] === ".") {
          if (hasDot) break;
          hasDot = true;
        }
        i += 1;
      }
      if (
        i < expr.length &&
        (expr[i] === "e" || expr[i] === "E") &&
        /[0-9+-]/.test(expr[i + 1] || "")
      ) {
        i += 1;
        if (expr[i] === "+" || expr[i] === "-") i += 1;
        while (i < expr.length && /[0-9]/.test(expr[i])) i += 1;
      }
      const val = Number(expr.slice(start, i));
      if (!Number.isFinite(val)) {
        throw new Error("รูปแบบตัวเลขไม่ถูกต้อง");
      }
      tokens.push({ kind: "num", value: val });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      const start = i;
      i += 1;
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        i += 1;
      }
      tokens.push({ kind: "id", name: expr.slice(start, i).toLowerCase() });
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      i += 1;
      continue;
    }
    if (
      ch === "+" ||
      ch === "-" ||
      ch === "*" ||
      ch === "/" ||
      ch === "%" ||
      ch === "^" ||
      ch === "!"
    ) {
      tokens.push({ kind: "op", op: ch });
      i += 1;
      continue;
    }
    throw new Error(`พบอักขระที่ไม่รองรับ: "${ch}"`);
  }

  return tokens;
}

const KNOWN_FUNCS = new Set([
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "sinh",
  "cosh",
  "tanh",
  "log",
  "log10",
  "ln",
  "sqrt",
  "cbrt",
  "abs",
  "exp",
  "round",
  "floor",
  "ceil",
]);

function insertImplicitMultiplication(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const curr = tokens[i];
    if (out.length > 0) {
      const prev = out[out.length - 1];
      const prevEndsValue =
        prev.kind === "num" ||
        prev.kind === "rparen" ||
        (prev.kind === "op" && prev.op === "!") ||
        (prev.kind === "id" && !KNOWN_FUNCS.has(prev.name));
      const currStartsValue =
        curr.kind === "num" || curr.kind === "lparen" || curr.kind === "id";

      // Split things like "2pi", "2sin(30)", "(2)(3)", "3x", "x(4)"
      if (prevEndsValue && currStartsValue) {
        out.push({ kind: "op", op: "*" });
      }
    }
    out.push(curr);
  }
  return out;
}

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 170) {
    throw new Error("แฟกทอเรียลรองรับเฉพาะจำนวนเต็ม 0–170");
  }
  let res = 1;
  for (let i = 2; i <= n; i += 1) res *= i;
  return res;
}

function evaluateTokens(
  tokens: Token[],
  angleMode: AngleMode,
  lastAnswer: number,
  varName?: string,
  varValue?: number
): number {
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const consume = (): Token => tokens[pos++];

  const toRad = (v: number) =>
    angleMode === "deg" ? (v * Math.PI) / 180 : v;
  const fromRad = (v: number) =>
    angleMode === "deg" ? (v * 180) / Math.PI : v;

  const parseExpression = (): number => {
    let val = parseTerm();
    while (true) {
      const tok = peek();
      if (tok?.kind === "op" && (tok.op === "+" || tok.op === "-")) {
        consume();
        const rhs = parseTerm();
        val = tok.op === "+" ? val + rhs : val - rhs;
      } else {
        break;
      }
    }
    return val;
  };

  const parseTerm = (): number => {
    let val = parseUnary();
    while (true) {
      const tok = peek();
      if (
        tok?.kind === "op" &&
        (tok.op === "*" || tok.op === "/" || tok.op === "%")
      ) {
        consume();
        const rhs = parseUnary();
        if (tok.op === "*") val *= rhs;
        else if (tok.op === "/") {
          if (rhs === 0) throw new Error("ไม่สามารถหารด้วยศูนย์ได้");
          val /= rhs;
        } else {
          if (rhs === 0) throw new Error("ไม่สามารถหารเอาเศษด้วยศูนย์ได้");
          val %= rhs;
        }
      } else {
        break;
      }
    }
    return val;
  };

  const parseUnary = (): number => {
    const tok = peek();
    if (tok?.kind === "op" && (tok.op === "+" || tok.op === "-")) {
      consume();
      const val = parseUnary();
      return tok.op === "-" ? -val : val;
    }
    return parsePower();
  };

  const parsePower = (): number => {
    const base = parsePostfix();
    const tok = peek();
    if (tok?.kind === "op" && tok.op === "^") {
      consume();
      const exp = parseUnary();
      return Math.pow(base, exp);
    }
    return base;
  };

  const parsePostfix = (): number => {
    let val = parsePrimary();
    while (true) {
      const tok = peek();
      if (tok?.kind === "op" && tok.op === "!") {
        consume();
        val = factorial(val);
      } else {
        break;
      }
    }
    return val;
  };

  const applyFunction = (name: string, arg: number): number => {
    switch (name) {
      case "sin":
        return Math.sin(toRad(arg));
      case "cos":
        return Math.cos(toRad(arg));
      case "tan": {
        const rad = toRad(arg);
        if (Math.abs(Math.cos(rad)) < 1e-12) {
          throw new Error("ค่า tan ไม่นิยามที่มุมนี้");
        }
        return Math.tan(rad);
      }
      case "asin":
        return fromRad(Math.asin(arg));
      case "acos":
        return fromRad(Math.acos(arg));
      case "atan":
        return fromRad(Math.atan(arg));
      case "sinh":
        return Math.sinh(arg);
      case "cosh":
        return Math.cosh(arg);
      case "tanh":
        return Math.tanh(arg);
      case "log":
      case "log10":
        if (arg <= 0) throw new Error("ค่า log ต้องมากกว่า 0");
        return Math.log10(arg);
      case "ln":
        if (arg <= 0) throw new Error("ค่า ln ต้องมากกว่า 0");
        return Math.log(arg);
      case "sqrt":
        if (arg < 0) throw new Error("ค่ารากที่สองของจำนวนจริงต้องไม่ติดลบ");
        return Math.sqrt(arg);
      case "cbrt":
        return Math.cbrt(arg);
      case "abs":
        return Math.abs(arg);
      case "exp":
        return Math.exp(arg);
      case "round":
        return Math.round(arg);
      case "floor":
        return Math.floor(arg);
      case "ceil":
        return Math.ceil(arg);
      default:
        throw new Error(`ไม่รู้จักฟังก์ชัน ${name}`);
    }
  };

  const parsePrimary = (): number => {
    const tok = peek();
    if (!tok) {
      throw new Error("สมการยังไม่สมบูรณ์");
    }
    if (tok.kind === "num") {
      consume();
      return tok.value;
    }
    if (tok.kind === "lparen") {
      consume();
      const inner = parseExpression();
      const closing = peek();
      if (closing?.kind !== "rparen") {
        throw new Error("วงเล็บปิดไม่ครบ");
      }
      consume();
      return inner;
    }
    if (tok.kind === "id") {
      consume();
      if (tok.name === "pi") return Math.PI;
      if (tok.name === "e") return Math.E;
      if (tok.name === "ans") return lastAnswer;
      if (varName && tok.name === varName && varValue !== undefined) {
        return varValue;
      }
      if (KNOWN_FUNCS.has(tok.name)) {
        const next = peek();
        if (next?.kind === "lparen") {
          consume();
          const arg = parseExpression();
          if (peek()?.kind !== "rparen") {
            throw new Error(`วงเล็บปิดของ ${tok.name}(...) ไม่ครบ`);
          }
          consume();
          return applyFunction(tok.name, arg);
        }
        const arg = parseUnary();
        return applyFunction(tok.name, arg);
      }
      throw new Error(`ไม่รู้จักตัวแปรหรือฟังก์ชัน "${tok.name}"`);
    }
    throw new Error("รูปแบบสมการไม่ถูกต้อง");
  };

  const result = parseExpression();
  if (pos < tokens.length) {
    throw new Error("มีสัญลักษณ์ส่วนเกินในสมการ");
  }
  if (!Number.isFinite(result)) {
    throw new Error("ผลลัพธ์เกินขอบเขตตัวเลขที่คำนวณได้");
  }
  return result;
}

export function formatMathNumber(value: number, decimals: number = 8): string {
  if (Math.abs(value) < 1e-12) return "0";
  const rounded = Number(value.toPrecision(12));
  const fixed = Number(rounded.toFixed(decimals));
  if (Math.abs(fixed) >= 1e12 || (Math.abs(fixed) > 0 && Math.abs(fixed) < 1e-7)) {
    return rounded.toExponential(6).replace(/\.?0+e/, "e");
  }
  return String(fixed);
}

export function evaluateScientificMath(
  rawExpr: string,
  options?: {
    angleMode?: AngleMode;
    decimals?: number;
    lastAnswer?: number;
  }
): MathEvalResult {
  const angleMode = options?.angleMode ?? "deg";
  const decimals = options?.decimals ?? 8;
  const lastAnswer = options?.lastAnswer ?? 0;

  const normalized = normalizeMathExpression(rawExpr);
  if (!normalized) {
    return { ok: false, error: "กรุณาพิมพ์หรือเขียนสมการก่อนคำนวณ" };
  }

  try {
    // Support 1-variable linear equations such as "2x + 5 = 19"
    if (normalized.includes("=")) {
      const parts = normalized.split("=");
      if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
        return { ok: false, error: "รูปแบบสมการเครื่องหมาย = ไม่ถูกต้อง" };
      }

      const lhsTokens = insertImplicitMultiplication(tokenizeMath(parts[0]));
      const rhsTokens = insertImplicitMultiplication(tokenizeMath(parts[1]));

      const candidateVars = new Set<string>();
      for (const tok of [...lhsTokens, ...rhsTokens]) {
        if (
          tok.kind === "id" &&
          tok.name !== "pi" &&
          tok.name !== "e" &&
          tok.name !== "ans" &&
          !KNOWN_FUNCS.has(tok.name)
        ) {
          candidateVars.add(tok.name);
        }
      }

      if (candidateVars.size === 0) {
        // Evaluate left-hand side cleanly if trailing "=" (or compare equality)
        const val = evaluateTokens(lhsTokens, angleMode, lastAnswer);
        return {
          ok: true,
          normalized,
          value: val,
          formatted: formatMathNumber(val, decimals),
        };
      }

      if (candidateVars.size > 1) {
        return {
          ok: false,
          error: "รองรับการแก้สมการที่มีตัวแปรเดียวในแต่ละครั้งครับ",
        };
      }

      const [varName] = Array.from(candidateVars);
      const diffAt = (v: number) =>
        evaluateTokens(lhsTokens, angleMode, lastAnswer, varName, v) -
        evaluateTokens(rhsTokens, angleMode, lastAnswer, varName, v);

      const d0 = diffAt(0);
      const d1 = diffAt(1);
      const d2 = diffAt(2);
      const slope = d1 - d0;

      if (Math.abs(d2 - (d0 + 2 * slope)) > 1e-6) {
        return {
          ok: false,
          error: "สมการไม่เป็นเชิงเส้น ระบบช่วยแก้เฉพาะสมการตัวแปรเดียวกำลังหนึ่งครับ",
        };
      }
      if (Math.abs(slope) < 1e-12) {
        return {
          ok: false,
          error:
            Math.abs(d0) < 1e-9
              ? "สมการเป็นจริงทุกค่า"
              : "สมการนี้ไม่มีคำตอบ",
        };
      }

      const sol = -d0 / slope;
      return {
        ok: true,
        normalized,
        value: sol,
        formatted: formatMathNumber(sol, decimals),
        solvedVariable: varName,
      };
    }

    const tokens = insertImplicitMultiplication(tokenizeMath(normalized));
    if (tokens.length === 0) {
      return { ok: false, error: "ไม่พบนิพจน์ที่คำนวณได้" };
    }
    const value = evaluateTokens(tokens, angleMode, lastAnswer);
    return {
      ok: true,
      normalized,
      value,
      formatted: formatMathNumber(value, decimals),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "คำนวณสมการไม่สำเร็จ",
    };
  }
}
