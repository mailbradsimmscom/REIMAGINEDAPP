// scripts/smoke.mjs
const url = process.env.URL || 'http://localhost:3000/bff/web/query';

const body = {
  question: process.argv[2] || 'tell me about my GPS',
  debug: true
};

const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

const json = await res.json();
console.log(JSON.stringify(json, null, 2));

// quick signal
if (json?._retrieval) {
  console.log('\n[retrieval]', json._retrieval);
}
