import { DurableObject } from "cloudflare:workers";
import webpush from 'web-push';
import { verify } from 'hono/jwt';

/**
 * ChatRoom Durable Object
 * Handles real-time messaging for a specific channel.
 * Uses WebSocket Hibernation for efficient connection management.
 */
export class ChatRoom extends DurableObject {
    private channelName: string = "";
    private typingUsers: Map<string, number> = new Map();

    constructor(state: DurableObjectState, env: Env) {
        super(state, env);

        // Initialize the SQLite table for messages
        // Initialize the SQLite table for messages
        this.ctx.storage.sql.exec(`
          CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            author TEXT,
            content TEXT,
            timestamp INTEGER,
            reply_to_id TEXT,
            reply_to_author TEXT,
            reply_to_content TEXT,
            is_edited INTEGER DEFAULT 0,
            is_deleted INTEGER DEFAULT 0
          )
        `);

        this.ctx.storage.sql.exec(`
          CREATE TABLE IF NOT EXISTS reactions (
            message_id TEXT,
            username TEXT,
            emoji TEXT,
            created_at INTEGER,
            PRIMARY KEY (message_id, username, emoji)
          )
        `);

        // Migration for existing tables that lack the columns
        try {
            this.ctx.storage.sql.exec("ALTER TABLE messages ADD COLUMN reply_to_id TEXT");
            this.ctx.storage.sql.exec("ALTER TABLE messages ADD COLUMN reply_to_author TEXT");
            this.ctx.storage.sql.exec("ALTER TABLE messages ADD COLUMN reply_to_content TEXT");
        } catch (e) { }
        try {
            this.ctx.storage.sql.exec("ALTER TABLE messages ADD COLUMN is_edited INTEGER DEFAULT 0");
            this.ctx.storage.sql.exec("ALTER TABLE messages ADD COLUMN is_deleted INTEGER DEFAULT 0");
        } catch (e) { }
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        // Internal presence update from PresenceTracker
        if (url.pathname === "/update-presence") {
            const data: any = await request.json();
            this.broadcastToClients(JSON.stringify(data));
            return new Response("OK");
        }

        // Extract channel name from /ws/:name and persist it
        if (url.pathname.startsWith("/ws/")) {
            const name = url.pathname.split("/")[2] || "";
            if (name) {
                this.channelName = name;
                this.ctx.storage.put("channelName", name);
            }
        }

        // Restore name if it's missing (e.g. on alarm or internal update)
        if (!this.channelName) {
            this.channelName = await this.ctx.storage.get<string>("channelName") || "";
        }

        const token = url.searchParams.get("token");
        // ... (rest of fetch remains same, but we'll notify presence)
        let user: any = { username: "Anonymous" };
        if (token) {
            try {
                user = await verify(token, this.env.JWT_SECRET, "HS256");
            } catch (e) {
                console.error("JWT Verify failed:", e);
                return new Response("Unauthorized", { status: 401 });
            }
        }

        const upgradeHeader = request.headers.get("Upgrade");
        if (!upgradeHeader || upgradeHeader !== "websocket") {
            return new Response("Expected Upgrade: websocket", { status: 426 });
        }

        const webSocketPair = new WebSocketPair();
        const [client, server] = Object.values(webSocketPair);

        // Associate user info with the socket
        this.ctx.acceptWebSocket(server, [user.username]);

        // Register membership in D1 with self-healing for ID changes
        if (user.id) {
            this.ctx.waitUntil((async () => {
                // Check if username maps to a different ID in this channel (stale record)
                const existing = await this.env.DB.prepare(
                    "SELECT user_id FROM channel_members WHERE channel_id = ? AND username = ?"
                ).bind(this.ctx.id.toString(), user.username).first();

                if (existing && existing.user_id !== user.id) {
                    console.log(`[Membership] Healing stale ID for ${user.username}: ${existing.user_id} -> ${user.id}`);
                    // Delete old entry (since PK includes user_id, we can't update part of PK easily if schema enforces references, but here PK is (channel, user))
                    // Actually, if we update user_id, we might conflict if that ID is already there (unlikely).
                    // Safer: Delete old, Insert new.
                    await this.env.DB.prepare(
                        "DELETE FROM channel_members WHERE channel_id = ? AND username = ?"
                    ).bind(this.ctx.id.toString(), user.username).run();
                }

                await this.env.DB.prepare(
                    "INSERT OR IGNORE INTO channel_members (channel_id, user_id, username, joined_at) VALUES (?, ?, ?, ?)"
                ).bind(this.ctx.id.toString(), user.id, user.username, Date.now()).run();
            })());
        }

        const history = this.ctx.storage.sql.exec(`
          SELECT 
            m.*, 
            (SELECT json_group_array(json_object('emoji', r.emoji, 'username', r.username)) 
             FROM reactions r WHERE r.message_id = m.id) as reactions
          FROM messages m 
          WHERE m.is_deleted = 0 
          ORDER BY m.timestamp ASC
        `).toArray().map(row => ({
            ...row,
            reactions: JSON.parse(row.reactions as string)
        }));
        server.send(JSON.stringify({ type: "history", messages: history }));

        // Notify Global Presence
        await this.notifyPresence("join", user.username, undefined, user.avatar_url);

        // Fetch current global presence and send it to the user immediately
        const presenceId = this.env.PRESENCE.idFromName("global");
        const presenceStub = this.env.PRESENCE.get(presenceId);
        const presenceRes = await presenceStub.fetch(`http://presence/?action=get&username=${user.username}&roomId=${this.ctx.id.toString()}`);
        const onlineUsers = await presenceRes.json();
        server.send(JSON.stringify({ type: "presence", users: onlineUsers }));

        return new Response(null, {
            status: 101,
            webSocket: client,
        });
    }

    private async notifyPresence(action: "join" | "leave" | "notify-message", username: string, body?: any, avatarUrl?: string) {
        const id = this.env.PRESENCE.idFromName("global");
        const stub = this.env.PRESENCE.get(id);
        let url = `http://presence/?action=${action}&username=${username}&roomId=${this.channelName}`;
        if (avatarUrl) url += `&avatarUrl=${encodeURIComponent(avatarUrl)}`;

        await stub.fetch(new Request(url, {
            method: body ? "POST" : "GET",
            body: body ? JSON.stringify(body) : undefined
        }));
    }

    private broadcastToClients(msg: string) {
        this.ctx.getWebSockets().forEach(ws => ws.send(msg));
    }

    // Deprecated in favor of global presence updates
    broadcastPresence() { }

    async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
        const messageStr = typeof message === "string" ? message : new TextDecoder().decode(message);
        const tags = this.ctx.getTags(ws);
        const username = tags[0] || "Anonymous";

        let data: any;
        try {
            data = JSON.parse(messageStr);
        } catch (e) {
            data = { content: messageStr };
        }

        // Handle typing indicator
        if (data.type === "typing") {
            this.typingUsers.set(username, Date.now());

            // Clean up stale typing users (older than 4 seconds)
            const now = Date.now();
            for (const [user, ts] of this.typingUsers.entries()) {
                if (now - ts > 4000) this.typingUsers.delete(user);
            }

            const typingList = Array.from(this.typingUsers.keys());
            this.broadcastToClients(JSON.stringify({
                type: "typing",
                users: typingList
            }));
            return;
        }

        // Handle Edit
        if (data.type === "edit") {
            const { id, content } = data;
            // Verify ownership (simplified: assume frontend only sends for self)
            // In production, we'd check against the 'author' of the original message
            this.ctx.storage.sql.exec(
                "UPDATE messages SET content = ?, is_edited = 1 WHERE id = ?",
                content, id
            );
            this.broadcastToClients(JSON.stringify({
                type: "message-update",
                id,
                content,
                is_edited: 1
            }));
            return;
        }

        // Handle Delete
        if (data.type === "delete") {
            const { id } = data;
            // Option A: Hard delete
            // this.ctx.storage.sql.exec("DELETE FROM messages WHERE id = ?", id);
            // Option B: Soft delete (better for sync consistency)
            this.ctx.storage.sql.exec("UPDATE messages SET is_deleted = 1 WHERE id = ?", id);

            this.broadcastToClients(JSON.stringify({
                type: "message-delete",
                id
            }));
            return;
        }

        // Handle Reactions
        if (data.type === "reaction-add") {
            const { message_id, emoji } = data;
            const timestamp = Date.now();
            try {
                this.ctx.storage.sql.exec(
                    "INSERT OR REPLACE INTO reactions (message_id, username, emoji, created_at) VALUES (?, ?, ?, ?)",
                    message_id, username, emoji, timestamp
                );
                this.broadcastToClients(JSON.stringify({
                    type: "reaction-update",
                    message_id,
                    username,
                    emoji,
                    action: "add"
                }));
                // Trigger sync
                const alarm = await this.ctx.storage.getAlarm();
                if (alarm === null) this.ctx.storage.setAlarm(Date.now() + 10000);
            } catch (e) {
                console.error("Failed to add reaction:", e);
            }
            return;
        }

        if (data.type === "reaction-remove") {
            const { message_id, emoji } = data;
            try {
                this.ctx.storage.sql.exec(
                    "DELETE FROM reactions WHERE message_id = ? AND username = ? AND emoji = ?",
                    message_id, username, emoji
                );
                this.broadcastToClients(JSON.stringify({
                    type: "reaction-update",
                    message_id,
                    username,
                    emoji,
                    action: "remove"
                }));
                // Trigger sync
                const alarm = await this.ctx.storage.getAlarm();
                if (alarm === null) this.ctx.storage.setAlarm(Date.now() + 10000);
            } catch (e) {
                console.error("Failed to remove reaction:", e);
            }
            return;
        }

        // Handle Profile Update (Avatar change)
        if (data.type === "profile-update") {
            const { username, avatar_url } = data;
            this.broadcastToClients(JSON.stringify({
                type: "profile-update",
                username,
                avatar_url
            }));
            return;
        }

        const id = crypto.randomUUID();
        const timestamp = Date.now();
        const content = data.content;
        const replyToId = data.reply_to_id || null;
        const replyToAuthor = data.reply_to_author || null;
        const replyToContent = data.reply_to_content || null;

        this.ctx.storage.sql.exec(
            "INSERT INTO messages (id, author, content, timestamp, reply_to_id, reply_to_author, reply_to_content) VALUES (?, ?, ?, ?, ?, ?, ?)",
            id, username, content, timestamp, replyToId, replyToAuthor, replyToContent
        );

        // Extract mentions: @username
        const mentions = (content.match(/@(\w+)/g) || []).map((m: string) => m.slice(1));

        // Auto-mention the person being replied to
        if (replyToAuthor && !mentions.includes(replyToAuthor)) {
            mentions.push(replyToAuthor);
        }

        // Notify Global Presence of active messaging for notifications
        this.ctx.waitUntil(this.notifyPresence("notify-message", username, {
            mentionedUsers: mentions,
            timestamp: timestamp
        }));

        // Broadcast the message with its ID and timestamp
        const outgoing = JSON.stringify({
            type: "message",
            id,
            author: username,
            content,
            timestamp,
            reply_to_id: replyToId,
            reply_to_author: replyToAuthor,
            reply_to_content: replyToContent
        });

        // When a message is sent, the user is definitely not typing anymore
        this.typingUsers.delete(username);
        this.broadcastToClients(JSON.stringify({
            type: "typing",
            users: Array.from(this.typingUsers.keys())
        }));

        this.ctx.getWebSockets().forEach((client) => {
            if (client !== ws) {
                client.send(outgoing);
            }
        });

        // Set an alarm to sync with D1 later (if not already set)
        const alarm = await this.ctx.storage.getAlarm();
        if (alarm === null) {
            // Schedule sync in 10 seconds
            this.ctx.storage.setAlarm(Date.now() + 10000);
        }

        // Trigger Push Notifications
        this.ctx.waitUntil(this.triggerPushNotifications(username, content, mentions, replyToAuthor));
    }

    private async triggerPushNotifications(sender: string, content: string, mentions: string[], replyToAuthor: string | null) {
        const roomId = this.ctx.id.toString();

        // 1. Get all members of this channel (including their IDs)
        // Note: D1 is used here as it's the source of truth for membership
        const { results: members } = await this.env.DB.prepare(
            "SELECT user_id, username FROM channel_members WHERE channel_id = ?"
        ).bind(roomId).all();

        // 2. Filter out the sender
        const recipients = members.filter((m: any) => m.username !== sender);
        if (recipients.length === 0) return;

        // 3. For each recipient, check their notification settings and subscriptions
        for (const recipient of recipients) {
            const settingsRequest = await this.env.DB.prepare(
                "SELECT level, room_id FROM notification_settings WHERE user_id = ? AND (room_id = ? OR room_id IS NULL) ORDER BY room_id DESC LIMIT 1"
            ).bind((recipient as any).user_id, roomId).first();

            const level = (settingsRequest as any)?.level || 'all';

            if (level === 'mute') continue;
            if (level === 'mentions' && !mentions.includes((recipient as any).username) && (recipient as any).username !== replyToAuthor) continue;

            // Get push subscriptions
            const { results: subs } = await this.env.DB.prepare(
                "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?"
            ).bind((recipient as any).user_id).all();

            if (subs.length === 0) continue;

            const payload = {
                title: `${sender} in #${this.channelName || 'Accord'}`,
                body: content.length > 100 ? content.slice(0, 100) + '...' : content,
                url: `/?room=${this.channelName || roomId}`
            };

            // Update Notification Queue for this user
            try {
                await this.env.DB.prepare(`
                    INSERT INTO notification_queue (user_id, title, body, url, timestamp)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET
                    title = excluded.title,
                    body = excluded.body,
                    url = excluded.url,
                    timestamp = excluded.timestamp
                `).bind(
                    (recipient as any).user_id,
                    payload.title,
                    payload.body,
                    payload.url,
                    Date.now()
                ).run();
            } catch (e) {
                console.error(`[Push Debug] Failed to update queue for ${(recipient as any).username}:`, e);
            }

            // Send push to each subscription
            for (const sub of subs) {
                try {
                    await this.sendPush(sub, payload);
                } catch (e) {
                    console.error(`Failed to send push to ${(recipient as any).username}:`, e);
                }
            }
        }
    }

    private async sendPush(subscription: any, payload: any) {
        console.log(`[Push Notification] SENDING to: ${subscription.endpoint}`);

        const pushConfig = {
            endpoint: subscription.endpoint,
            keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth
            }
        };

        webpush.setVapidDetails(
            'mailto:admin@example.com',
            this.env.VAPID_PUBLIC_KEY,
            this.env.VAPID_PRIVATE_KEY
        );

        const options = {
            TTL: 60,
            urgency: 'high' as webpush.Urgency
        };

        try {
            await webpush.sendNotification(pushConfig, JSON.stringify(payload), options);
            console.log(`[Push Notification] Success`);
        } catch (e: any) {
            console.error(`[Push Notification] Error:`, e);
            if (e.statusCode === 410 || e.statusCode === 404) {
                // Clean up expired subs
                await this.env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
                    .bind(subscription.endpoint).run();
            }
        }
    }

    async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
        // Handle disconnects
        console.log(`WebSocket closed: ${code} ${reason}`);
        const tags = this.ctx.getTags(ws);
        if (tags[0]) {
            this.ctx.waitUntil(this.notifyPresence("leave", tags[0]));
        }
    }

    async webSocketError(ws: WebSocket, error: any) {
        // Handle errors
        console.error(`WebSocket error: ${error}`);
    }

    async alarm() {
        console.log("Syncing to D1...");

        // 1. Sync Messages
        const history = this.ctx.storage.sql.exec("SELECT * FROM messages").toArray();
        if (history.length > 0) {
            try {
                const statements = history.map(msg =>
                    this.env.DB.prepare(`
                        INSERT INTO messages (id, channel_id, author, content, timestamp, reply_to_id, reply_to_author, reply_to_content, is_edited, is_deleted)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            content = excluded.content,
                            is_edited = excluded.is_edited,
                            is_deleted = excluded.is_deleted
                    `)
                        .bind(msg.id, this.ctx.id.toString(), msg.author, msg.content, msg.timestamp, msg.reply_to_id, msg.reply_to_author, msg.reply_to_content, msg.is_edited, msg.is_deleted)
                );
                await this.env.DB.batch(statements);
                console.log(`Synced ${history.length} messages to D1`);
                // Prune local
                this.ctx.storage.sql.exec("DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY timestamp DESC LIMIT 50)");
            } catch (e) {
                console.error("Failed to sync messages:", e);
            }
        }

        // 2. Sync Reactions
        const reactions = this.ctx.storage.sql.exec("SELECT * FROM reactions").toArray();
        if (reactions.length > 0) {
            try {
                // Clear and rebuild reactions for synced messages in D1 or just use UPSERT logic
                // For simplicity, we'll sync all existing reactions in DO.
                const stmts = reactions.map(r =>
                    this.env.DB.prepare("INSERT OR REPLACE INTO message_reactions (message_id, username, emoji, created_at) VALUES (?, ?, ?, ?)")
                        .bind(r.message_id, r.username, r.emoji, r.created_at)
                );
                await this.env.DB.batch(stmts);
                console.log(`Synced ${reactions.length} reactions to D1`);
            } catch (e) {
                console.error("Failed to sync reactions:", e);
            }
        }
    }
}
