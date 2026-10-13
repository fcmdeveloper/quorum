// Lista los textos en español de la app (claves de traducción) y las plantillas `${}` que
// conviene pasar a t('… {x} …'). Uso: node scripts/i18n-extract.js [--templates]
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const files = [];
const walk = (d) => {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { if (f !== 'i18n') walk(p); }
    else if (/\.(tsx?|ts)$/.test(f)) files.push(p);
  }
};
walk(path.join(root, 'src'));
files.push(path.join(root, 'App.tsx'));
const spanishish = (s) => {
  const x = s.trim();
  if (!x || !/[A-Za-zÁÉÍÓÚáéíóúñÑ]/.test(x)) return false;
  if (/^(https?:|#|\.|\/|[a-z]+:\/\/)/.test(x)) return false;
  if (/^[a-z][A-Za-z0-9_-]*$/.test(x)) return false; // ids, iconos, rutas
  if (/^[A-Z0-9_]+$/.test(x) && x.length < 6) return false; // XRP, USD
  if (/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(x)) return false;
  return /[ áéíóúñ¿¡ÁÉÍÓÚÑ]/.test(x) || /^[A-ZÁÉÍÓÚ]/.test(x);
};
const keys = new Map();
const templates = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rel = path.relative(root, f);
  const visit = (n) => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const p = n.parent;
      const isKey = p && ts.isPropertyAssignment(p) && p.name === n;
      const inType = p && (ts.isLiteralTypeNode(p));
      const isJsxAttrName = false;
      if (!isKey && !inType && spanishish(n.text)) {
        const k = n.text;
        if (!keys.has(k)) keys.set(k, `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
      }
    } else if (ts.isJsxText(n)) {
      const k = n.text.replace(/\s+/g, ' ').trim();
      if (spanishish(k) && !keys.has(k)) keys.set(k, `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
    } else if (ts.isTemplateExpression(n)) {
      const txt = n.getText();
      if (/[a-záéíóúñ]{3,} [a-záéíóúñ]/i.test(txt.replace(/\$\{[^}]*\}/g, ''))) {
        templates.push(`${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}: ${txt.slice(0, 140)}`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
if (process.argv.includes('--templates')) console.log(templates.join('\n'));
else if (process.argv.includes('--json')) console.log(JSON.stringify([...keys.keys()], null, 1));
else for (const [k, w] of keys) console.log(`${w}\t${k}`);
