// scripts/create-route-stubs.js
import fs from "fs";
import path from "path";

const routesDir = path.resolve("src/routes");
const indexFile = path.resolve("index.js");

// Ensure the routes directory exists
if (!fs.existsSync(routesDir)) {
  fs.mkdirSync(routesDir, { recursive: true });
  console.log(`Created directory: ${routesDir}`);
}

// Stub definitions
const stubs = {
  "documents.js": `import { Router } from 'express';
const router = Router();

router.get('/', async (req, res) => {
  res.json({ ok: true, docs: [] }); // TODO: hook into Supabase system_knowledge
});

export default router;`,

  "topics.js": `import { Router } from 'express';
const router = Router();

router.get('/', async (req, res) => {
  res.json({ ok: true, topics: [] }); // TODO: query Supabase for distinct knowledge_type
});

export default router;`,

  "admin.js": `import { Router } from 'express';
const router = Router();

router.get('/supabase', async (req, res) => {
  res.json({ ok: true, health: { ok: true }, summary: {} });
});

export default router;`,

  "qa.js": `import { Router } from 'express';
const router = Router();

router.post('/feedback', async (req, res) => {
  res.json({ ok: true, received: req.body }); // TODO: insert into qa_feedback
});

export default router;`,
};

// Write each stub file
Object.entries(stubs).forEach(([filename, content]) => {
  const filePath = path.join(routesDir, filename);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content.trim() + "\n");
    console.log(`Created: ${filePath}`);
  } else {
    console.log(`Skipped (already exists): ${filePath}`);
  }
});

// --- Update index.js ---
if (fs.existsSync(indexFile)) {
  let indexContent = fs.readFileSync(indexFile, "utf-8");

  // Add imports if missing
  Object.keys(stubs).forEach((file) => {
    const base = file.replace(".js", "");
    const importLine = `import ${base}Routes from './src/routes/${file}';`;
    if (!indexContent.includes(importLine)) {
      indexContent = importLine + "\n" + indexContent;
      console.log(`Added import for ${file}`);
    }
  });

  // Add app.use lines if missing
  const mountPoints = {
    documents: "/documents",
    topics: "/topics",
    admin: "/admin",
    qa: "/qa",
  };

  Object.entries(mountPoints).forEach(([base, pathUrl]) => {
    const useLine = `app.use('${pathUrl}', ${base}Routes);`;
    if (!indexContent.includes(useLine)) {
      // Place before export or end of file
      indexContent += "\n" + useLine;
      console.log(`Added app.use for ${pathUrl}`);
    }
  });

  fs.writeFileSync(indexFile, indexContent, "utf-8");
  console.log("✅ index.js updated with new routes");
}

console.log("✅ Route stubs generated!");
