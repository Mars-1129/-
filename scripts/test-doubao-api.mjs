const k = process.env.VOLC_ARK_API_KEY;
console.log("Key:", k ? k.slice(0, 12) + "..." : "NONE");
fetch(process.env.VOLC_ARK_API_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + k },
  body: JSON.stringify({ model: "ep-20260514115629-vhldw", messages: [{ role: "user", content: "hi" }], max_tokens: 5 }),
  signal: AbortSignal.timeout(8000)
}).then(r => r.json()).then(d => console.log("OK:", JSON.stringify(d).slice(0, 300))).catch(e => console.log("ERR:", e.message));
