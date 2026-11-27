export type AngleMode = "deg" | "rad";

export type MathEvalKind =
  | "number"
  | "linear1var"
  | "quadratic1var"
  | "linear2var"
  | "system2var";

export type MathEvalResult =
  | {
      ok: true;
      normalized: string;
      value: number;
      formatted: string;
      solvedVariable?: string;
      kind?: MathEvalKind;
      summaryLines?: string[];
      variables?: string[];
      sampleTable?: Array<{
        inputs: Record<string, number>;
        outputs: Record<string, string>;
      }>;
      roots?: string[];
      systemSolution?: Record<string, string>;
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

      // Split things like "2pi", "2sin(30)", "(2)(3)", "3x", "x(4)", "2x", "xy"
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
  vars?: Record<string, number>
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
      if (vars && tok.name in vars) {
        return vars[tok.name];
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

function collectVariables(
  tokens: Token[],
  substitutions?: Record<string, number>
): string[] {
  const vars = new Set<string>();
  for (const tok of tokens) {
    if (
      tok.kind === "id" &&
      tok.name !== "pi" &&
      tok.name !== "e" &&
      tok.name !== "ans" &&
      !KNOWN_FUNCS.has(tok.name) &&
      !(substitutions && tok.name in substitutions)
    ) {
      vars.add(tok.name);
    }
  }
  // Order x, y, z cleanly if present, then alphabetical
  return Array.from(vars).sort((a, b) => {
    const order = (v: string) =>
      v === "x" ? "0" : v === "y" ? "1" : v === "z" ? "2" : `3_${v}`;
    return order(a).localeCompare(order(b));
  });
}

function formatLinearRHS(
  coeffVar: number,
  varName: string,
  constant: number,
  decimals: number
): string {
  const cVar = Math.abs(coeffVar) < 1e-10 ? 0 : coeffVar;
  const cConst = Math.abs(constant) < 1e-10 ? 0 : constant;

  const parts: string[] = [];
  if (cVar !== 0) {
    if (Math.abs(cVar - 1) < 1e-9) parts.push(varName);
    else if (Math.abs(cVar + 1) < 1e-9) parts.push(`-${varName}`);
    else parts.push(`${formatMathNumber(cVar, decimals)}${varName}`);
  }

  if (cConst !== 0 || parts.length === 0) {
    const absStr = formatMathNumber(Math.abs(cConst), decimals);
    if (parts.length === 0) {
      parts.push(cConst < 0 ? `-${absStr}` : absStr);
    } else {
      parts.push(cConst < 0 ? `- ${absStr}` : `+ ${absStr}`);
    }
  }

  return parts.join(" ");
}

function formatSolvedLinearRelation(
  target: string,
  aTarget: number,
  other: string,
  aOther: number,
  c: number,
  decimals: number
): string {
  const denom = Math.abs(aTarget);
  const numOther = aTarget > 0 ? -aOther : aOther;
  const numConst = aTarget > 0 ? -c : c;

  if (Math.abs(denom - 1) < 1e-9) {
    return `${target} = ${formatLinearRHS(numOther, other, numConst, decimals)}`;
  }

  const cleanFrac =
    Math.abs(denom - Math.round(denom)) < 1e-6 &&
    (Math.abs(numOther % denom) > 1e-6 || Math.abs(numConst % denom) > 1e-6);

  if (cleanFrac) {
    const numExpr = formatLinearRHS(numOther, other, numConst, decimals);
    return `${target} = (${numExpr}) / ${formatMathNumber(denom, decimals)}`;
  }

  return `${target} = ${formatLinearRHS(
    numOther / denom,
    other,
    numConst / denom,
    decimals
  )}`;
}

function solveOneVarEquation(
  varName: string,
  lhsTokens: Token[],
  rhsTokens: Token[],
  normalized: string,
  angleMode: AngleMode,
  lastAnswer: number,
  substitutions: Record<string, number> | undefined,
  decimals: number
): MathEvalResult {
  const diffAt = (v: number) =>
    evaluateTokens(lhsTokens, angleMode, lastAnswer, {
      ...substitutions,
      [varName]: v,
    }) -
    evaluateTokens(rhsTokens, angleMode, lastAnswer, {
      ...substitutions,
      [varName]: v,
    });

  const d0 = diffAt(0);
  const d1 = diffAt(1);
  const dm1 = diffAt(-1);
  const d2 = diffAt(2);
  const dm2 = diffAt(-2);

  const c = d0;
  const a = (d1 + dm1 - 2 * c) / 2;
  const b = (d1 - dm1) / 2;

  // Verify polynomial degree <= 2
  const err2 = Math.abs(d2 - (4 * a + 2 * b + c));
  const errm2 = Math.abs(dm2 - (4 * a - 2 * b + c));
  if (err2 > 1e-5 || errm2 > 1e-5) {
    return {
      ok: false,
      error: "สมการไม่เป็นเชิงเส้นหรือกำลังสอง ระบบรองรับสมการตัวแปรเดียวกำลัง 1–2 ครับ",
    };
  }

  // Linear equation b*x + c = 0
  if (Math.abs(a) < 1e-10) {
    if (Math.abs(b) < 1e-12) {
      return {
        ok: false,
        error:
          Math.abs(c) < 1e-9
            ? "สมการเป็นจริงทุกค่า"
            : "สมการนี้ไม่มีคำตอบ",
      };
    }
    const sol = -c / b;
    const fmt = formatMathNumber(sol, decimals);
    return {
      ok: true,
      kind: "linear1var",
      normalized,
      value: sol,
      formatted: fmt,
      solvedVariable: varName,
      variables: [varName],
      summaryLines: [`${varName} = ${fmt}`],
    };
  }

  // Quadratic equation a*x^2 + b*x + c = 0
  const disc = b * b - 4 * a * c;
  if (disc > 1e-9) {
    const sq = Math.sqrt(disc);
    const r1 = (-b + sq) / (2 * a);
    const r2 = (-b - sq) / (2 * a);
    const f1 = formatMathNumber(r1, decimals);
    const f2 = formatMathNumber(r2, decimals);
    return {
      ok: true,
      kind: "quadratic1var",
      normalized,
      value: r1,
      formatted: `${f1}, ${f2}`,
      solvedVariable: varName,
      variables: [varName],
      roots: [f1, f2],
      summaryLines: [
        `${varName}₁ = ${f1} , ${varName}₂ = ${f2}`,
        `Δ = b² - 4ac = ${formatMathNumber(disc, decimals)}`,
      ],
    };
  }

  if (Math.abs(disc) <= 1e-9) {
    const r = -b / (2 * a);
    const f = formatMathNumber(r, decimals);
    return {
      ok: true,
      kind: "quadratic1var",
      normalized,
      value: r,
      formatted: f,
      solvedVariable: varName,
      variables: [varName],
      roots: [f],
      summaryLines: [`${varName} = ${f} (รากซ้ำ 1 ค่า)`],
    };
  }

  // Complex roots p ± qi
  const real = -b / (2 * a);
  const imag = Math.sqrt(-disc) / Math.abs(2 * a);
  const realStr = Math.abs(real) < 1e-10 ? "" : formatMathNumber(real, decimals);
  const imagStr =
    Math.abs(imag - 1) < 1e-9 ? "i" : `${formatMathNumber(imag, decimals)}i`;
  const rPlus = realStr ? `${realStr} + ${imagStr}` : imagStr;
  const rMinus = realStr ? `${realStr} - ${imagStr}` : `-${imagStr}`;
  return {
    ok: true,
    kind: "quadratic1var",
    normalized,
    value: real,
    formatted: `${rPlus}, ${rMinus}`,
    solvedVariable: varName,
    variables: [varName],
    roots: [rPlus, rMinus],
    summaryLines: [
      `${varName}₁ = ${rPlus}`,
      `${varName}₂ = ${rMinus}`,
      `(คำตอบจำนวนเชิงซ้อน เนื่องจาก Δ < 0)`,
    ],
  };
}

function extractTwoVarLinearCoeffs(
  u: string,
  v: string,
  lhsTokens: Token[],
  rhsTokens: Token[],
  angleMode: AngleMode,
  lastAnswer: number
): { au: number; av: number; c: number } | null {
  const f = (vu: number, vv: number) =>
    evaluateTokens(lhsTokens, angleMode, lastAnswer, { [u]: vu, [v]: vv }) -
    evaluateTokens(rhsTokens, angleMode, lastAnswer, { [u]: vu, [v]: vv });

  const c = f(0, 0);
  const au = f(1, 0) - c;
  const av = f(0, 1) - c;

  if (
    Math.abs(f(1, 1) - (au + av + c)) > 1e-5 ||
    Math.abs(f(2, -1) - (2 * au - av + c)) > 1e-5
  ) {
    return null;
  }
  return { au, av, c };
}

export function evaluateScientificMath(
  rawExpr: string,
  options?: {
    angleMode?: AngleMode;
    decimals?: number;
    lastAnswer?: number;
    substitutions?: Record<string, number>;
  }
): MathEvalResult {
  const angleMode = options?.angleMode ?? "deg";
  const decimals = options?.decimals ?? 8;
  const lastAnswer = options?.lastAnswer ?? 0;
  const substitutions = options?.substitutions;

  const normalized = normalizeMathExpression(rawExpr);
  if (!normalized) {
    return { ok: false, error: "กรุณาพิมพ์หรือเขียนสมการก่อนคำนวณ" };
  }

  try {
    // Support 2-equation linear systems separated by ";" or newline
    const systemLines = normalized
      .split(/[;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (systemLines.length >= 2) {
      if (systemLines.length !== 2) {
        return {
          ok: false,
          error: "ระบบสมการรองรับการแก้ 2 สมการพร้อมกัน (คั่นด้วย ; )",
        };
      }
      const parsedPairs = systemLines.map((line) => {
        const parts = line.split("=");
        if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
          throw new Error("รูปแบบสมการในระบบสมการไม่ถูกต้อง");
        }
        return {
          lhs: insertImplicitMultiplication(tokenizeMath(parts[0])),
          rhs: insertImplicitMultiplication(tokenizeMath(parts[1])),
        };
      });

      const sysVars = collectVariables(
        parsedPairs.flatMap((p) => [...p.lhs, ...p.rhs])
      );
      if (sysVars.length !== 2) {
        return {
          ok: false,
          error: "ระบบสมการ 2 สมการต้องมีตัวแปรรวมกัน 2 ตัว (เช่น x, y)",
        };
      }

      const [u, v] = sysVars;
      const eq1 = extractTwoVarLinearCoeffs(
        u,
        v,
        parsedPairs[0].lhs,
        parsedPairs[0].rhs,
        angleMode,
        lastAnswer
      );
      const eq2 = extractTwoVarLinearCoeffs(
        u,
        v,
        parsedPairs[1].lhs,
        parsedPairs[1].rhs,
        angleMode,
        lastAnswer
      );
      if (!eq1 || !eq2) {
        return {
          ok: false,
          error: "ระบบสมการรองรับเฉพาะสมการเชิงเส้น (กำลังหนึ่ง)",
        };
      }

      const det = eq1.au * eq2.av - eq2.au * eq1.av;
      if (Math.abs(det) < 1e-10) {
        return {
          ok: false,
          error: "สมการทั้งสองขนานกันหรือทับกัน (ไม่มีคำตอบเดียว)",
        };
      }

      const uSol = (eq1.av * eq2.c - eq2.av * eq1.c) / det;
      const vSol = (eq1.c * eq2.au - eq2.c * eq1.au) / det;
      const uFmt = formatMathNumber(uSol, decimals);
      const vFmt = formatMathNumber(vSol, decimals);

      return {
        ok: true,
        kind: "system2var",
        normalized,
        value: uSol,
        formatted: `${u} = ${uFmt}, ${v} = ${vFmt}`,
        variables: [u, v],
        systemSolution: { [u]: uFmt, [v]: vFmt },
        summaryLines: [
          `แก้ระบบสมการได้:`,
          `${u} = ${uFmt}`,
          `${v} = ${vFmt}`,
        ],
      };
    }

    // Single expression or single equation with "="
    if (normalized.includes("=")) {
      const parts = normalized.split("=");
      if (parts.length !== 2 || !parts[0].trim()) {
        return { ok: false, error: "รูปแบบสมการเครื่องหมาย = ไม่ถูกต้อง" };
      }

      const lhsTokens = insertImplicitMultiplication(tokenizeMath(parts[0]));

      // Allow trailing "=" like "5 * 3 + 2 ="
      if (!parts[1].trim()) {
        const lhsVars = collectVariables(lhsTokens, substitutions);
        if (lhsVars.length > 0) {
          return { ok: false, error: "รูปแบบสมการเครื่องหมาย = ยังไม่ครบ" };
        }
        const val = evaluateTokens(lhsTokens, angleMode, lastAnswer, substitutions);
        return {
          ok: true,
          kind: "number",
          normalized,
          value: val,
          formatted: formatMathNumber(val, decimals),
        };
      }

      const rhsTokens = insertImplicitMultiplication(tokenizeMath(parts[1]));
      const candidateVars = collectVariables(
        [...lhsTokens, ...rhsTokens],
        substitutions
      );

      if (candidateVars.length === 0) {
        const val = evaluateTokens(lhsTokens, angleMode, lastAnswer, substitutions);
        return {
          ok: true,
          kind: "number",
          normalized,
          value: val,
          formatted: formatMathNumber(val, decimals),
        };
      }

      if (candidateVars.length === 1) {
        return solveOneVarEquation(
          candidateVars[0],
          lhsTokens,
          rhsTokens,
          normalized,
          angleMode,
          lastAnswer,
          substitutions,
          decimals
        );
      }

      if (candidateVars.length === 2) {
        const [u, v] = candidateVars;
        const coeffs = extractTwoVarLinearCoeffs(
          u,
          v,
          lhsTokens,
          rhsTokens,
          angleMode,
          lastAnswer
        );
        if (!coeffs) {
          return {
            ok: false,
            error: "รองรับการวิเคราะห์สมการเชิงเส้น 2 ตัวแปร เช่น 5x + 3 = y",
          };
        }

        const { au, av, c } = coeffs;
        const solveV =
          Math.abs(av) > 1e-10
            ? formatSolvedLinearRelation(v, av, u, au, c, decimals)
            : `${u} = ${formatMathNumber(-c / au, decimals)}`;
        const solveU =
          Math.abs(au) > 1e-10
            ? formatSolvedLinearRelation(u, au, v, av, c, decimals)
            : `${v} = ${formatMathNumber(-c / av, decimals)}`;

        const summaryLines: string[] = [solveV, solveU];
        if (Math.abs(av) > 1e-10 && Math.abs(au) > 1e-10) {
          const yInt = -c / av;
          const xInt = -c / au;
          summaryLines.push(
            `เมื่อ ${u} = 0 ⇒ ${v} = ${formatMathNumber(yInt, decimals)} | เมื่อ ${v} = 0 ⇒ ${u} = ${formatMathNumber(xInt, decimals)}`
          );
        }

        const sampleTable = [-1, 0, 1, 2, 3].map((uVal) => {
          if (Math.abs(av) > 1e-10) {
            const vVal = (-au * uVal - c) / av;
            return {
              inputs: { [u]: uVal },
              outputs: { [v]: formatMathNumber(vVal, decimals) },
            };
          }
          return {
            inputs: { [u]: uVal },
            outputs: { [v]: "ทุกค่า" },
          };
        });

        const interceptNum =
          Math.abs(av) > 1e-10 ? -c / av : Math.abs(au) > 1e-10 ? -c / au : 0;

        return {
          ok: true,
          kind: "linear2var",
          normalized,
          value: interceptNum,
          formatted: solveV,
          variables: [u, v],
          summaryLines,
          sampleTable,
        };
      }

      return {
        ok: false,
        error: "รองรับการแก้สมการสูงสุด 2 ตัวแปร (เช่น x, y) ต่อครั้งครับ",
      };
    }

    const tokens = insertImplicitMultiplication(tokenizeMath(normalized));
    if (tokens.length === 0) {
      return { ok: false, error: "ไม่พบนิพจน์ที่คำนวณได้" };
    }
    const remainingVars = collectVariables(tokens, substitutions);
    if (remainingVars.length > 0) {
      return {
        ok: false,
        error: `กรุณาใส่ "=" เพื่อแก้สมการ (พบตัวแปร ${remainingVars.join(", ")})`,
      };
    }
    const value = evaluateTokens(tokens, angleMode, lastAnswer, substitutions);
    return {
      ok: true,
      kind: "number",
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
