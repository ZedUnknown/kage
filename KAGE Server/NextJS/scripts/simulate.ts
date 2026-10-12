// Simulates a chair node by POSTing what the broker webhook would send.
//   npx tsx scripts/simulate.ts <chairId> <sit|leave|online|offline> [baseUrl]
// Reads INGEST_KEY from the environment.
export {};
const [chairId, cmd, base = "http://localhost:3000"] = process.argv.slice(2);
const site = process.env.SITE_ID ?? "lab1";

if (!chairId || !["sit", "leave", "online", "offline"].includes(cmd ?? "")) {
  console.error("usage: simulate.ts <chairId> <sit|leave|online|offline> [baseUrl]");
  process.exit(1);
}

const boot = process.env.BOOT_ID ?? "sim";
const seq = Math.floor(Date.now() / 1000);
const body =
  cmd === "sit" || cmd === "leave"
    ? { topic: `kage/${site}/chair/${chairId}/state`, payload: { occupied: cmd === "sit", boot, seq } }
    : { topic: `kage/${site}/chair/${chairId}/status`, payload: cmd };

const res = await fetch(`${base}/api/ingest`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-ingest-key": process.env.INGEST_KEY ?? "" },
  body: JSON.stringify(body),
});
console.log(res.status, await res.text());
