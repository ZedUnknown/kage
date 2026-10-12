/**
 * Public contract of the Messaging module: push a message to one PC.
 * Implementations must not throw. A lost push is recovered when the PC
 * resyncs through the state endpoint.
 */
export interface CommandPublisher {
  publish(pcId: string, message: unknown): Promise<void>;
}

export const pcCommandTopic = (siteId: string, pcId: string) => `kage/${siteId}/pc/${pcId}/cmd`;
