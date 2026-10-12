// End-to-end broker check. Plays a PC and a chair node, so you can verify:
//   chair message -> broker rule -> POST /api/ingest -> backend -> command -> broker -> this "PC"
//
//   npx tsx --env-file=.env.local scripts/mqtt-check.ts <pcId> <chairId>
//
// Needs MQTT_URL (+ MQTT_USERNAME / MQTT_PASSWORD) and SITE_ID, the PC and chair
// registered in the admin console, and the broker's webhook rule pointing at a
// URL the broker can reach (your Vercel deployment).
import mqtt from "mqtt";

const [pcId, chairId] = process.argv.slice(2);
const url = process.env.MQTT_URL;
const site = process.env.SITE_ID || "lab1";

if (!pcId || !chairId || !url) {
  console.error("usage: mqtt-check.ts <pcId> <chairId>   (MQTT_URL must be set)");
  process.exit(1);
}

const client = mqtt.connect(url, {
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  clientId: `kage-check-${Math.random().toString(16).slice(2, 8)}`,
});

const cmdTopic = `kage/${site}/pc/${pcId}/cmd`;
const stateTopic = `kage/${site}/chair/${chairId}/state`;
const fail = (msg: string) => {
  console.error("FAIL:", msg);
  client.end(true, () => process.exit(1));
};

client.on("error", (e) => fail(`connection: ${e.message}`));

client.on("connect", () => {
  console.log("connected to broker");
  client.subscribe(cmdTopic, { qos: 1 }, (err) => {
    if (err) return fail(`subscribe ${cmdTopic}: ${err.message}`);
    console.log("subscribed to", cmdTopic);

    // A leave event for a fresh boot, so it is never judged stale.
    const payload = { occupied: false, boot: `check${Date.now()}`, seq: 1 };
    client.publish(stateTopic, JSON.stringify(payload), { qos: 1 }, (e) => {
      if (e) return fail(`publish ${stateTopic}: ${e.message}`);
      console.log("published chair state:", JSON.stringify(payload));
    });
  });
});

const timer = setTimeout(
  () => fail("no command within 15 s. Check the webhook rule, INGEST_KEY, and that the chair is assigned to the PC."),
  15_000,
);

client.on("message", (topic, buf) => {
  clearTimeout(timer);
  const cmd = JSON.parse(buf.toString());
  console.log(`received on ${topic}:`, cmd.type, `action ${cmd.actionId} v${cmd.version}`);
  console.log("PASS: the full path works");
  client.end(true, () => process.exit(0));
});
