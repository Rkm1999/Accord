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
      return response;
    }

    if (url.pathname === "/api/history") {
      const { results } = await env.DB.prepare(
        "SELECT id, username, message, timestamp, link_url, link_title, link_description, link_image, file_name, file_type, file_size, file_key, reply_to, reply_username, reply_message, reply_timestamp, is_edited, edited_at FROM messages ORDER BY timestamp DESC LIMIT 100"
      ).all();

      return Response.json(results.reverse());
    }

    return new Response("Not Found", { status: 404 });
  },
};

export { ChatRoom };
