import { DurableObject } from "cloudflare:workers";

/**
 * PresenceTracker Durable Object (Singleton)
 * Tracks all online users across the entire server.
 */
export class PresenceTracker extends DurableObject {
    // Map of username -> { count: number, avatar_url: string | null }
    private userConnections: Map<string, { count: number, avatar_url: string | null }> = new Map();
    // Set of ChatRoom DO IDs that are currently active and need updates
    private activeRooms: Set<string> = new Set();

    constructor(state: DurableObjectState, env: Env) {
        super(state, env);
        this.ctx.storage.sql.exec(`
          CREATE TABLE IF NOT EXISTS room_metadata (
            room_id TEXT PRIMARY KEY,
            last_message_timestamp INTEGER
          )
        `);
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const action = url.searchParams.get("action");
        const username = url.searchParams.get("username");
        const roomId = url.searchParams.get("roomId");

        if (action === "get-all-metadata") {
            const results = this.ctx.storage.sql.exec("SELECT * FROM room_metadata").toArray();
            return new Response(JSON.stringify(results));
        }

        if (!username && action !== "notify-message") return new Response("Missing username param", { status: 400 });
        if (!roomId && action !== "get") return new Response("Missing roomId param", { status: 400 });

        if (action === "join") {
            const current = this.userConnections.get(username!) || { count: 0, avatar_url: null };
            let avatarUrl = url.searchParams.get("avatarUrl") || current.avatar_url;
            // Decode potential "null" string
            if (avatarUrl === "null") avatarUrl = null;

            this.userConnections.set(username!, {
                count: current.count + 1,
                avatar_url: avatarUrl
            });
            this.activeRooms.add(roomId!);

            this.broadcastToRooms();
        } else if (action === "leave") {
            const current = this.userConnections.get(username!);
            if (current) {
                const newCount = current.count - 1;
                if (newCount <= 0) {
                    this.userConnections.delete(username!);
                } else {
                    // Update avatar just in case? No need.
                    this.userConnections.set(username!, { ...current, count: newCount });
                }
                this.broadcastToRooms();
            }
        } else if (action === "get") {
            // Transform map to array of partial objects
            const users = Array.from(this.userConnections.entries()).map(([name, data]) => ({
                username: name,
                avatar_url: data.avatar_url
            }));
            return new Response(JSON.stringify(users));
        } else if (action === "notify-message") {
            const body = await request.json().catch(() => ({}));
            const ts = (body as any).timestamp || Date.now();

            // Persist the latest message timestamp for this room
            this.ctx.storage.sql.exec(
                "INSERT INTO room_metadata (room_id, last_message_timestamp) VALUES (?, ?) ON CONFLICT(room_id) DO UPDATE SET last_message_timestamp = ?",
                roomId!, ts, ts
            );

            this.broadcastToRooms({
                type: "notification",
                roomId: roomId!,
                mentionedUsers: (body as any).mentionedUsers || []
            });
        }

        return new Response("OK");
    }

    private async broadcastToRooms(options?: { type: string; roomId: string; mentionedUsers?: string[] }) {
        const payload = options
            ? JSON.stringify(options)
            : JSON.stringify({
                type: "presence",
                users: Array.from(this.userConnections.entries()).map(([name, data]) => ({
                    username: name,
                    avatar_url: data.avatar_url
                }))
            });

        // Notify all active rooms to update their connected clients
        const promises = Array.from(this.activeRooms).map(async (roomId) => {
            try {
                const id = this.env.CHAT_ROOM.idFromName(roomId);
                const stub = this.env.CHAT_ROOM.get(id);
                await stub.fetch(new Request("http://do/update-presence", {
                    method: "POST",
                    body: payload
                }));
            } catch (e) {
                this.activeRooms.delete(roomId);
            }
        });

        await Promise.all(promises);
    }
}
