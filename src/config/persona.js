import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ../.. from /src/config => project root, then /docs/assistant_persona_REIMAGINEDSV.md
const personaPath = path.resolve(__dirname, '../../docs/assistant_persona_REIMAGINEDSV.md');

let PERSONA = '';
try {
  PERSONA = fs.readFileSync(personaPath, 'utf8');
  if (!PERSONA.trim()) {
    console.warn('[persona] Loaded but empty:', personaPath);
  }
} catch (e) {
  console.warn('[persona] Could not read persona file:', personaPath, e.message);
}

export { PERSONA };
export default PERSONA;
