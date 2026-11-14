// Comprueba las traducciones: lista los textos de t()/tn() que no están en
// src/i18n/en.ts. Uso: npm run i18n:check
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '../src');
const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []));

const keys = new Map();
for (const file of walk(root)) {
  if (file.includes(`${path.sep}i18n${path.sep}`)) continue;
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && (n.expression.text === 't' || n.expression.text === 'tn')) {
      const args = n.expression.text === 't' ? [n.arguments[0]] : [n.arguments[1], n.arguments[2]];
      for (const a of args) if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) && !keys.has(a.text)) keys.set(a.text, path.relative(root, file));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

const en = fs.readFileSync(path.join(root, 'i18n/en.ts'), 'utf8');
const have = new Set([...en.matchAll(/^\s*("(?:[^"\\]|\\.)*"):/gm)].map((m) => JSON.parse(m[1])));
const missing = [...keys].filter(([k]) => !have.has(k));
console.log(`${keys.size} textos en t(); ${missing.length} sin traducir al inglés.`);
for (const [k, f] of missing) console.log(`  ${f}: ${JSON.stringify(k)}`);
process.exitCode = missing.length ? 1 : 0;
