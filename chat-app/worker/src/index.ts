import { DurableObjectNamespace } from "cloudflare:workers";
import { ChatRoom } from "./ChatRoom";

export interface Env {
  CHAT_ROOM: DurableObjectNamespace<ChatRoom>;
  DB: D1Database;
  BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const username = url.searchParams.get("username");
      if (!username) {
        return new Response("Username required", { status: 400 });
      }

      const stub = env.CHAT_ROOM.getByName("main-room");
      return stub.fetch(request);
    }

    if (url.pathname.startsWith("/api/file/")) {
      const key = url.pathname.replace("/api/file/", "");
      if (!key) {
        return new Response("File key required", { status: 400 });
      }

      const object = await env.BUCKET.get(key);
      if (!object) {
        return new Response("File not found", { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Access-Control-Allow-Origin", "*");

      return new Response(object.body, { headers });
    }

    if (url.pathname === "/api/users") {
      const stub = env.CHAT_ROOM.getByName("main-room");
      const response = await stub.fetch(request);
      const newResponse = new Response(response.body, response);
      newResponse.headers.set("Access-Control-Allow-Origin", "*");
      return newResponse;
    }

    if (url.pathname === "/api/history") {
      const channelId = url.searchParams.get("channelId") || "1";
      const { results } = await env.DB.prepare(
        "SELECT id, username, message, timestamp, link_url, link_title, link_description, link_image, file_name, file_type, file_size, file_key, reply_to, reply_username, reply_message, reply_timestamp, is_edited, edited_at, channel_id FROM messages WHERE channel_id = ? ORDER BY timestamp DESC LIMIT 100"
      ).bind(channelId).all();

      const headers = new Headers();
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(JSON.stringify(results.reverse()), { headers });
    }

    if (url.pathname === "/api/channels" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT id, name, created_by, created_at FROM channels ORDER BY id ASC"
      ).all();

      const headers = new Headers();
      headers.set("Access-Control-Allow-Origin", "*");

      return new Response(JSON.stringify(results), { headers });
    }

    if (url.pathname === "/api/channels" && request.method === "POST") {
      const { name, createdBy } = await request.json();

      if (!name || !createdBy) {
        const headers = new Headers();
        headers.set("Access-Control-Allow-Origin", "*");
        return new Response("Name and createdBy are required", { status: 400, headers });
      }

      try {
        const result = await env.DB.prepare(
          "INSERT INTO channels (name, created_by, created_at) VALUES (?, ?, ?)"
        ).bind(name, createdBy, Date.now()).run();

        const channel = await env.DB.prepare(
          "SELECT id, name, created_by, created_at FROM channels WHERE id = ?"
        ).bind(result.meta.last_row_id).first();

        const headers = new Headers();
        headers.set("Access-Control-Allow-Origin", "*");

        return new Response(JSON.stringify(channel), { headers });
      } catch (error: any) {
        if (error.message?.includes("UNIQUE")) {
          const headers = new Headers();
          headers.set("Access-Control-Allow-Origin", "*");
          return new Response("Channel name already exists", { status: 409, headers });
        }
        const headers = new Headers();
        headers.set("Access-Control-Allow-Origin", "*");
        return new Response("Failed to create channel", { status: 500, headers });
      }
    }

    if (url.pathname.match(/^\/api\/channels\/\d+$/) && request.method === "DELETE") {
      const channelId = url.pathname.split("/").pop();

      if (channelId === "1") {
        const headers = new Headers();
        headers.set("Access-Control-Allow-Origin", "*");
        return new Response("Cannot delete general channel", { status: 403, headers });
      }

      await env.DB.prepare(
        "DELETE FROM messages WHERE channel_id = ?"
      ).bind(channelId).run();

      await env.DB.prepare(
        "DELETE FROM channels WHERE id = ?"
      ).bind(channelId).run();

      const headers = new Headers();
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response("Channel deleted", { status: 200, headers });
    }

    if (request.method === "OPTIONS") {
      const headers = new Headers();
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      return new Response(null, { headers });
    }

    return new Response("Not Found", { status: 404 });
  },
};

export { ChatRoom };
