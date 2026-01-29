import { DurableObject } from "cloudflare:workers";

/**
 * PresenceTracker Durable Object (Singleton)
 * Tracks all online users across the entire server.
 */
export class PresenceTracker extends DurableObject {
    // Map of username -> { count: number, avatar_url: string | null }
    // DEPRECATED: Using SQL now for hibernation persistence
    // private userConnections: Map<string, { count: number, avatar_url: string | null }> = new Map();
    // private activeRooms: Set<string> = new Set();

    constructor(state: DurableObjectState, env: Env) {
        super(state, env);

        // Persist room metadata
        this.ctx.storage.sql.exec(`
          CREATE TABLE IF NOT EXISTS room_metadata (
            room_id TEXT PRIMARY KEY,
            last_message_timestamp INTEGER
          )
        `);

        // Persist active sessions (survives hibernation)
        try {
            // Check if we need to migrate from (username, room_id) PK to (session_id) PK
            this.ctx.storage.sql.exec("SELECT session_id FROM presence_sessions LIMIT 1");
        } catch (e) {
            console.log("[PresenceTracker] Migrating presence_sessions table to new schema...");
            this.ctx.storage.sql.exec("DROP TABLE IF EXISTS presence_sessions");
        }

        this.ctx.storage.sql.exec(`
          CREATE TABLE IF NOT EXISTS presence_sessions (
            session_id TEXT PRIMARY KEY,
            username TEXT,
            room_id TEXT,
            avatar_url TEXT,
            last_seen INTEGER
          )
        `);
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const action = url.searchParams.get("action");
        const username = url.searchParams.get("username");
        const roomId = url.searchParams.get("roomId");

        console.log(`[PresenceTracker] Action: ${action}, User: ${username}, Room: ${roomId}`);

        const sessionId = url.searchParams.get("sessionId");

        // Maintenance: Periodically clear stale sessions (> 60s)
        this.ctx.storage.sql.exec("DELETE FROM presence_sessions WHERE last_seen < ?", Date.now() - 60000);

        if (action === "get-all-metadata") {
            const results = this.ctx.storage.sql.exec("SELECT * FROM room_metadata").toArray();
            return new Response(JSON.stringify(results));
        }

        if (!username && action !== "notify-message" && action !== "get") return new Response("Missing username param", { status: 400 });
        if (!sessionId && (action === "join" || action === "leave" || action === "heartbeat")) return new Response("Missing sessionId param", { status: 400 });
        if (!roomId && (action === "join" || action === "leave" || action === "heartbeat" || action === "notify-message")) return new Response("Missing roomId param", { status: 400 });

        if (action === "join" || action === "heartbeat") {
            let avatarUrl = url.searchParams.get("avatarUrl");
            if (!avatarUrl && action === "heartbeat") {
                const existing = this.ctx.storage.sql.exec("SELECT avatar_url FROM presence_sessions WHERE session_id = ?", sessionId!).toArray()[0];
                avatarUrl = existing ? (existing.avatar_url as string) : null;
            }
            if (avatarUrl === "null") avatarUrl = null;

            this.ctx.storage.sql.exec(
                "INSERT OR REPLACE INTO presence_sessions (session_id, username, room_id, avatar_url, last_seen) VALUES (?, ?, ?, ?, ?)",
                sessionId!, username!, roomId!, avatarUrl, Date.now()
            );

            this.broadcastToRooms();
        } else if (action === "leave") {
            this.ctx.storage.sql.exec(
                "DELETE FROM presence_sessions WHERE session_id = ?",
                sessionId!
            );
            this.broadcastToRooms();
        } else if (action === "get") {
            const results = this.ctx.storage.sql.exec("SELECT DISTINCT username, avatar_url FROM presence_sessions").toArray();
            return new Response(JSON.stringify(results));
        } else if (action === "notify-message") {
            const body = await request.json().catch(() => ({}));
            const ts = (body as any).timestamp || Date.now();

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
        let payload: string;

        if (options) {
            payload = JSON.stringify(options);
        } else {
            const users = this.ctx.storage.sql.exec("SELECT DISTINCT username, avatar_url FROM presence_sessions").toArray();
            payload = JSON.stringify({
                type: "presence",
                users: users
            });
        }

        // Get all rooms that currently have active sessions to notify them
        const activeRoomsInSql = this.ctx.storage.sql.exec("SELECT DISTINCT room_id FROM presence_sessions").toArray();
        const roomIds = activeRoomsInSql.map(r => r.room_id as string);

        // Always include the current room if we know it (safety)
        // Note: For notify-message, we might be broadcasting to rooms that don't have the user online.
        if (options?.roomId && !roomIds.includes(options.roomId)) {
            roomIds.push(options.roomId);
        }

        const promises = roomIds.map(async (roomName) => {
            try {
                const id = this.env.CHAT_ROOM.idFromName(roomName);
                const stub = this.env.CHAT_ROOM.get(id);
                console.log(`[PresenceTracker] Broadcasting to room: ${roomName} (${id.toString()})`);
                await stub.fetch(new Request("http://do/update-presence", {
                    method: "POST",
                    body: payload
                }));
            } catch (e) {
                console.error(`[PresenceTracker] Failed to broadcast to ${roomName}:`, e);
            }
        });

        await Promise.all(promises);
    }
}
