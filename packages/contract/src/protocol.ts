import { z } from "zod";
import { Station, StationHealth, FsEntry } from "./station";

export const RequestMsg = z.object({ type: z.literal("req"), id: z.string(), verb: z.string(), params: z.unknown() });
export const ResponseMsg = z.object({ type: z.literal("res"), id: z.string(), ok: z.boolean(), data: z.unknown().optional(), error: z.string().optional() });
export const StreamMsg = z.object({ type: z.literal("stream"), id: z.string(), seq: z.number().int(), chunk: z.string().nullable(), eof: z.boolean() });
export const CancelMsg = z.object({ type: z.literal("cancel"), id: z.string() });

export type RequestMsg = z.infer<typeof RequestMsg>;
export type ResponseMsg = z.infer<typeof ResponseMsg>;
export type StreamMsg = z.infer<typeof StreamMsg>;

export const VERB_PARAMS = {
  "detect": z.object({}),
  "health": z.object({ key: z.string() }),
  "fs.list": z.object({ key: z.string(), path: z.string() }),
  "fs.read": z.object({ key: z.string(), path: z.string(), maxBytes: z.number().int().optional() }),
  "logs.tail": z.object({ key: z.string(), follow: z.boolean() }),
} as const;

// VERB_RESULTS describes what the NODE returns on each verb.
// NOTE: "detect" returns plain Station[] (no adopted field) — the hub
// annotates adopted:true/false from its DB before forwarding to clients.
export const VERB_RESULTS = {
  "detect": z.array(Station),
  "health": StationHealth,
  "fs.list": z.array(FsEntry),
  "fs.read": z.object({ content: z.string(), encoding: z.enum(["utf8","base64"]), truncated: z.boolean() }),
} as const;
