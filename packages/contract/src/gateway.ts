import { z } from "zod";
import { HostInfo } from "./node";
import { RequestMsg, ResponseMsg, StreamMsg, CancelMsg } from "./protocol";

export const HelloMsg = z.object({ type: z.literal("hello"), hostInfo: HostInfo });
export const HeartbeatMsg = z.object({ type: z.literal("heartbeat"), ts: z.number() });
export const AckMsg = z.object({ type: z.literal("ack"), ts: z.number() });

export const GatewayClientMessage = z.discriminatedUnion("type", [HelloMsg, HeartbeatMsg, ResponseMsg, StreamMsg]);
export type GatewayClientMessage = z.infer<typeof GatewayClientMessage>;
export const GatewayServerMessage = z.discriminatedUnion("type", [AckMsg, RequestMsg, CancelMsg]);
export type GatewayServerMessage = z.infer<typeof GatewayServerMessage>;
