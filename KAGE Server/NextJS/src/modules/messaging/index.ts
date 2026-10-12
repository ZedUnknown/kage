import type { CommandPublisher } from "./commandPublisher";
import { LogOnlyCommandPublisher } from "./infrastructure/LogOnlyCommandPublisher";
import { MqttCommandPublisher, type MqttSettings } from "./infrastructure/MqttCommandPublisher";

export type { CommandPublisher } from "./commandPublisher";
export { pcCommandTopic } from "./commandPublisher";

export function createMessagingModule(deps: { siteId: string; mqtt?: MqttSettings }): CommandPublisher {
  return deps.mqtt ? new MqttCommandPublisher(deps.mqtt, deps.siteId) : new LogOnlyCommandPublisher();
}
