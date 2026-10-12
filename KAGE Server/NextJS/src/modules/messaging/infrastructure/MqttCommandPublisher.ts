import mqtt, { MqttClient } from "mqtt";
import { pcCommandTopic, type CommandPublisher } from "../commandPublisher";

export type MqttSettings = { url: string; username?: string; password?: string };

const g = globalThis as unknown as { __kageMqtt?: MqttClient };

export class MqttCommandPublisher implements CommandPublisher {
  constructor(
    private readonly settings: MqttSettings,
    private readonly siteId: string,
  ) {}

  // One connection per process, reused across hot reloads and warm invocations.
  private client(): MqttClient {
    if (!g.__kageMqtt) {
      g.__kageMqtt = mqtt.connect(this.settings.url, {
        username: this.settings.username,
        password: this.settings.password,
        clientId: `kage-api-${Math.random().toString(16).slice(2, 10)}`,
        reconnectPeriod: 1000,
        connectTimeout: 5000,
      });
      g.__kageMqtt.on("error", (e) => console.error("[mqtt]", e.message));
    }
    return g.__kageMqtt;
  }

  async publish(pcId: string, message: unknown): Promise<void> {
    const client = this.client();
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("publish timeout")), 4000);
        client.publish(pcCommandTopic(this.siteId, pcId), JSON.stringify(message), { qos: 1 }, (err) => {
          clearTimeout(timer);
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (e) {
      console.error("[mqtt] publish failed", pcId, (e as Error).message);
    }
  }
}
