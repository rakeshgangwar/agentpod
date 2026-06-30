import { z } from "zod";
import { HostInfo } from "./node";
import { RequestMsg, ResponseMsg, StreamMsg, CancelMsg, InputMsg, ResizeMsg } from "./protocol";

export const HelloMsg = z.object({ type: z.literal("hello"), hostInfo: HostInfo, version: z.string().optional() });
export const HeartbeatMsg = z.object({ type: z.literal("heartbeat"), ts: z.number() });
export const AckMsg = z.object({ type: z.literal("ack"), ts: z.number() });

export const GatewayClientMessage = z.discriminatedUnion("type", [HelloMsg, HeartbeatMsg, ResponseMsg, StreamMsg]);
export type GatewayClientMessage = z.infer<typeof GatewayClientMessage>;
// Hub → node messages: ack/req/cancel (control) + input/resize (terminal interactivity)
export const GatewayServerMessage = z.discriminatedUnion("type", [AckMsg, RequestMsg, CancelMsg, InputMsg, ResizeMsg]);
export type GatewayServerMessage = z.infer<typeof GatewayServerMessage>;
