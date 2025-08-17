// scripts/audit-imports.js
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

const OLD_TO_NEW = {
  embed: 'embedText',            // old -> new
  complete: 'completeWithPolicy' // if any old 'complete' still lingers
};

function* walk(dir) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) yield* walk(p);
    else if (/\.(js|mjs|cjs)$/.test(name.name)) yield p;
  }
}

function findImports(text) {
  const matches = [];
  const re = /import\s+([\s\S]*?)\s+from\s+['"](.+?)['"];?/g;
  let m;
  while ((m = re.exec(text))) {
    matches.push({ full: m[0], clause: m[1], source: m[2], index: m.index });
  }
  return matches;
}

function updateNamedList(namedList) {
  // namedList like: "{ embed, something as alias }"
  const names = namedList
    .replace(/[{}]/g, '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  let changed = false;
  const rewritten = names.map(n => {
    // handle "embed as xyz"
    const m = n.match(/^(\w+)\s+as\s+(\w+)$/);
    if (m) {
      const [_, old, alias] = m;
      const newer = OLD_TO_NEW[old] || old;
      if (newer !== old) changed = true;
      return `${newer} as ${alias}`;
    } else {
      const old = n;
      const newer = OLD_TO_NEW[old] || old;
      if (newer !== old) changed = true;
      return newer;
    }
  });

  return { text: `{ ${rewritten.join(', ')} }`, changed };
}

function processFile(file, doFix) {
  const src = fs.readFileSync(file, 'utf8');
  const imports = findImports(src);

  let changed = false;
  let out = src;

  for (const im of imports) {
    // Normalize relative paths like '../ai/aiService' vs '../ai/aiService.js'
    const isAiService =
      im.source.endsWith('/ai/aiService') ||
      im.source.endsWith('/ai/aiService.js');

    if (!isAiService) continue;

    // Only care about named imports
    const named = im.clause.match(/^{[\s\S]*}$/);
    if (!named) continue;

    const { text: newNamed, changed: localChanged } = updateNamedList(im.clause);
    if (!localChanged) continue;

    const before = im.full;
    const after = `import ${newNamed} from '${im.source.endsWith('.js') ? im.source : im.source + '.js'}';`;

    if (doFix) {
      out = out.replace(before, after);
      changed = true;
    } else {
      console.log(`[FOUND] ${file}`);
      console.log(`  ${before}`);
      console.log(`  → ${after}`);
    }
  }

  if (doFix && changed) {
    fs.writeFileSync(file, out, 'utf8');
    console.log(`[FIXED] ${file}`);
  }
}

const doFix = process.argv.includes('--fix');

let count = 0;
for (const f of walk(SRC)) {
  processFile(f, doFix);
  count++;
}
if (!doFix) {
  console.log('\nRun again with --fix to apply the rewrites.');
}
