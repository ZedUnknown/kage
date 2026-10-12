import type { ActionType } from "./machine";

const verb = (t: ActionType) => (t === "lock" ? "lock" : "log out");

export const autoMessage = (t: ActionType) =>
  `You left your chair. This PC will ${verb(t)} unless you return.`;

export const forcedMessage = (t: ActionType) =>
  `An administrator has requested this PC to ${verb(t)}.`;
