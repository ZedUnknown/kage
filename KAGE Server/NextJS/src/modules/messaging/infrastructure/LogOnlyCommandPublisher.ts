import type { CommandPublisher } from "../commandPublisher";

/** Used when no broker is configured (local development). */
export class LogOnlyCommandPublisher implements CommandPublisher {
  async publish(pcId: string, message: unknown): Promise<void> {
    const type = (message as { type?: string })?.type ?? "message";
    console.warn(`[mqtt] MQTT_URL not set, not sending ${type} to ${pcId}`);
  }
}
