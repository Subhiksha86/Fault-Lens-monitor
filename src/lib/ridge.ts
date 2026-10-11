/** Gauss-Jordan elimination with partial pivoting. */
export function solve(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let k = c; k <= n; k++) M[c][k] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r) => r[n]);
}

/** Closed-form ridge; returns weights with intercept as last element (intercept not penalized). */
export function fitRidge(X: number[][], y: number[], lambda: number): number[] {
  const p = X[0].length + 1;
  const A = Array.from({ length: p }, () => new Array(p).fill(0));
  const b = new Array(p).fill(0);
  for (let i = 0; i < X.length; i++) {
    const row = [...X[i], 1];
    for (let a = 0; a < p; a++) {
      b[a] += row[a] * y[i];
      for (let c = a; c < p; c++) A[a][c] += row[a] * row[c];
    }
  }
  for (let a = 0; a < p; a++) for (let c = 0; c < a; c++) A[a][c] = A[c][a];
  for (let a = 0; a < p - 1; a++) A[a][a] += lambda;
  return solve(A, b);
}

export function predict(w: number[], x: number[]): number {
  let s = w[w.length - 1];
  for (let i = 0; i < x.length; i++) s += w[i] * x[i];
  return s;
}
