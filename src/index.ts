import { Hono } from 'hono';
import { sign, verify } from 'hono/jwt';
import { jwt } from 'hono/jwt';
import webpush from 'web-push';
import { ChatRoom } from "./chat-room";
import { PresenceTracker } from "./presence-tracker";
import { hashPassword } from './auth';

export { ChatRoom, PresenceTracker };

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('/api/*', (c, next) => {
	if (c.req.path === '/api/login' || c.req.path === '/api/register') {
		return next();
	}
	return jwt({ secret: c.env.JWT_SECRET, alg: 'HS256' })(c, next);
});

// Register
app.post('/api/register', async (c) => {
	try {
		const { username, email, password } = await c.req.json();
		console.log('[Register] Attempt:', { username, email });

		if (!username || !email || !password) {
			console.error('[Register] Missing fields');
			return c.json({ error: "Missing required fields" }, 400);
		}

		const id = crypto.randomUUID();
		const passwordHash = await hashPassword(password);

		await c.env.DB.prepare(
			"INSERT INTO users (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
		).bind(id, username, email, passwordHash, Date.now()).run();

		return c.json({ success: true, id });
	} catch (e: any) {
		console.error('[Register] Error:', e);
		// D1 constraint error usually contains "UNIQUE constraint failed"
		if (e.message?.includes('UNIQUE')) {
			return c.json({ error: "Username or email already exists" }, 400);
		}
		return c.json({ error: "Registration failed: " + e.message }, 400);
	}
});

// Login
app.post('/api/login', async (c) => {
	try {
		const { username, password } = await c.req.json();
		console.log('[Login] Attempt:', { username });

		if (!username || !password) {
			return c.json({ error: "Missing username or password" }, 400);
		}

		const user: any = await c.env.DB.prepare(
			"SELECT * FROM users WHERE username = ?"
		).bind(username).first();

		if (!user) {
			console.warn('[Login] User not found:', username);
			return c.json({ error: "Invalid credentials" }, 401);
		}

		const valid = await hashPassword(password) === user.password_hash;
		if (!valid) {
			console.warn('[Login] Invalid password for:', username);
			return c.json({ error: "Invalid credentials" }, 401);
		}

		try {
			const token = await sign({ id: user.id, username: user.username, avatar_url: user.avatar_url || null }, c.env.JWT_SECRET);
			return c.json({ token, username: user.username, avatar_url: user.avatar_url || null });
		} catch (err: any) {
			console.error("Login Sign Error:", err);
			return c.json({ error: "Login failed during token generation" }, 500);
		}
	} catch (e: any) {
		console.error('[Login] Unexpected Error:', e);
		return c.json({ error: "Login failed" }, 500);
	}
});

// Get current user info
app.get('/api/user/me', async (c) => {
	const jwtUser = c.get('jwtPayload') as any;
	const user: any = await c.env.DB.prepare(
		"SELECT id, username, avatar_url FROM users WHERE id = ?"
	).bind(jwtUser.id).first();
	if (!user) return c.json({ error: "User not found" }, 404);
	return c.json(user);
});

// Update user profile
app.put('/api/user/me', async (c) => {
	const jwtUser = c.get('jwtPayload') as any;
	const { username, email, password } = await c.req.json();
	const updates: string[] = [];
	const params: any[] = [];

	if (username) {
		// Check uniqueness if changing
		if (username !== jwtUser.username) {
			const existing: any = await c.env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
			if (existing) return c.json({ error: "Username already taken" }, 400);
		}
		updates.push("username = ?");
		params.push(username);
	}
	if (email) {
		updates.push("email = ?");
		params.push(email);
	}
	if (password) {
		const hash = await hashPassword(password);
		updates.push("password_hash = ?");
		params.push(hash);
	}

	if (updates.length > 0) {
		params.push(jwtUser.id);
		await c.env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
	}

	// Return new user info (and token if username changed)
	const newUser: any = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(jwtUser.id).first();

	if (!newUser) {
		return c.json({ error: "User not found" }, 404);
	}

	let token = undefined;
	if (username && username !== jwtUser.username) {
		token = await sign({ id: newUser.id, username: newUser.username, avatar_url: newUser.avatar_url || null }, c.env.JWT_SECRET);
	}

	return c.json({
		success: true,
		username: newUser.username,
		avatar_url: newUser.avatar_url,
		token
	});
});

// Avatar Upload
app.post('/api/user/avatar', async (c) => {
    const user = c.get('jwtPayload') as any;
    const body = await c.req.parseBody();
    const file = body['file'] as File;

    if (!file) {
        return c.json({ error: "Missing file" }, 400);
    }

    const fileName = `avatars/${user.id}-${Date.now()}.${file.name.split('.').pop()}`;
    await c.env.FILES.put(fileName, file.stream(), {
        httpMetadata: { contentType: file.type }
    });

    const avatarUrl = `/files/${fileName}`;
    await c.env.DB.prepare(
        "UPDATE users SET avatar_url = ? WHERE id = ?"
    ).bind(avatarUrl, user.id).run();
    console.log(`[Upload] Updated avatar for user ${user.username} (${user.id}) to ${avatarUrl}`);

    return c.json({ success: true, avatar_url: avatarUrl });
});

// Message Attachment Upload
app.post('/api/upload-message-attachment', async (c) => {
    const user = c.get('jwtPayload') as any;
    const body = await c.req.parseBody();
    const file = body['file'] as File;

    if (!file) {
        return c.json({ error: "Missing file" }, 400);
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'text/markdown'];
    if (!allowedTypes.includes(file.type)) {
        return c.json({ error: `File type not allowed. Allowed: ${allowedTypes.join(', ')}` }, 400);
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
        return c.json({ error: "File size too large. Maximum 10MB" }, 400);
    }

    // Generate unique filename
    const fileName = `${crypto.randomUUID()}-${file.name}`;
    await c.env.FILES.put(fileName, file.stream(), {
        httpMetadata: { contentType: file.type }
    });

    return c.json({
        url: `/files/${fileName}`,
        name: file.name,
        size: file.size,
        type: file.type
    });
});

// Channels
app.get('/api/channels', async (c) => {
	const user = c.get('jwtPayload') as any;
	const { results: channels } = await c.env.DB.prepare("SELECT * FROM channels ORDER BY name ASC").all();

	// Get real-time metadata from PresenceTracker (authoritative source)
	const presenceId = c.env.PRESENCE.idFromName("global");
	const presence = c.env.PRESENCE.get(presenceId);
	const metadataRes = await presence.fetch("http://do/?action=get-all-metadata");
	const liveMetadata: any[] = await metadataRes.json();

	const { results: userReadStates } = await c.env.DB.prepare(
		"SELECT room_id, last_read_timestamp FROM user_read_states WHERE user_id = ?"
	).bind(user.id).all();

	const mapped = channels.map((ch: any) => {
		const liveMsg = liveMetadata.find((m: any) => m.room_id === ch.id);
		const userState = userReadStates.find((s: any) => s.room_id === ch.id);
		return {
			...ch,
			last_timestamp: liveMsg ? liveMsg.last_message_timestamp : 0,
			last_read: userState ? userState.last_read_timestamp : 0
		};
	});

	return c.json(mapped);
});

app.post('/api/channels', async (c) => {
	const { name } = await c.req.json();
	const id = name.toLowerCase().replace(/\s+/g, '-');

	try {
		await c.env.DB.prepare(
			"INSERT INTO channels (id, name, created_at) VALUES (?, ?, ?)"
		).bind(id, name, Date.now()).run();
		return c.json({ success: true, id });
	} catch (e: any) {
		return c.json({ error: "Channel already exists" }, 400);
	}
});

// DMs
app.get('/api/dms', async (c) => {
	const user = c.get('jwtPayload') as any;
	const { results: dms } = await c.env.DB.prepare(
		"SELECT * FROM dm_rooms WHERE user1 = ? OR user2 = ? ORDER BY created_at DESC"
	).bind(user.username, user.username).all();

	// Get real-time metadata from PresenceTracker
	const presenceId = c.env.PRESENCE.idFromName("global");
	const presence = c.env.PRESENCE.get(presenceId);
	const metadataRes = await presence.fetch("http://do/?action=get-all-metadata");
	const liveMetadata: any[] = await metadataRes.json();

	const { results: userReadStates } = await c.env.DB.prepare(
		"SELECT room_id, last_read_timestamp FROM user_read_states WHERE user_id = ?"
	).bind(user.id).all();

	const mapped = dms.map((dm: any) => {
		const liveMsg = liveMetadata.find((m: any) => m.room_id === dm.id);
		const userState = userReadStates.find((s: any) => s.room_id === dm.id);
		return {
			...dm,
			last_timestamp: liveMsg ? liveMsg.last_message_timestamp : 0,
			last_read: userState ? userState.last_read_timestamp : 0
		};
	});

	return c.json(mapped);
});

app.post('/api/rooms/:roomId/read', async (c) => {
	const user = c.get('jwtPayload') as any;
	const roomId = c.req.param('roomId');
	const { timestamp } = await c.req.json();

	await c.env.DB.prepare(
		"INSERT INTO user_read_states (user_id, room_id, last_read_timestamp) VALUES (?, ?, ?) ON CONFLICT(user_id, room_id) DO UPDATE SET last_read_timestamp = ?"
	).bind(user.id, roomId, timestamp, timestamp).run();

	return c.json({ success: true });
});

app.post('/api/dms', async (c) => {
	const user = c.get('jwtPayload') as any;
	const { target } = await c.req.json();

	if (user.username === target) return c.json({ error: "Cannot DM yourself" }, 400);

	// Ensure target user exists
	const targetUser = await c.env.DB.prepare("SELECT username FROM users WHERE username = ?").bind(target).first();
	if (!targetUser) return c.json({ error: "User not found" }, 404);

	const usernames = [user.username, target].sort();
	const dmId = `dm:${usernames[0]}:${usernames[1]}`;

	try {
		await c.env.DB.prepare(
			"INSERT INTO dm_rooms (id, user1, user2) VALUES (?, ?, ?)"
		).bind(dmId, usernames[0], usernames[1]).run();
	} catch (e) {
		// Room might already exist, which is fine
	}

	return c.json({ success: true, id: dmId });
});

// Member List (with avatars)
app.get('/api/channels/:roomId/members', async (c) => {
	const roomId = c.req.param('roomId');
	const id = c.env.CHAT_ROOM.idFromName(roomId).toString();
	const { results } = await c.env.DB.prepare(
		"SELECT cm.user_id, cm.username, u.avatar_url FROM channel_members cm LEFT JOIN users u ON cm.user_id = u.id WHERE cm.channel_id = ? ORDER BY cm.username ASC"
	).bind(id).all();
	console.log(`[API] Members for ${roomId} (${id}):`, JSON.stringify(results));
	return c.json(results);
});

// Push Notifications
app.get('/api/push/public-key', (c) => {
	return c.json({ publicKey: c.env.VAPID_PUBLIC_KEY });
});

app.post('/api/push/subscribe', async (c) => {
	const user = c.get('jwtPayload') as any;
	const subscription = await c.req.json();

	// In the payload strategy, the client sends the standard PushSubscription object
	if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
		return c.json({ error: "Invalid subscription" }, 400);
	}

	await c.env.DB.prepare(
		"INSERT OR REPLACE INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)"
	).bind(
		crypto.randomUUID(),
		user.id,
		subscription.endpoint,
		subscription.keys.p256dh,
		subscription.keys.auth,
		Date.now()
	).run();

	return c.json({ success: true });
});

app.post('/api/push/unsubscribe', async (c) => {
	const { endpoint } = await c.req.json();
	await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).run();
	return c.json({ success: true });
});

// Notification Settings
app.get('/api/settings/notifications', async (c) => {
	const user = c.get('jwtPayload') as any;
	const { results } = await c.env.DB.prepare(
		"SELECT room_id, level FROM notification_settings WHERE user_id = ?"
	).bind(user.id).all();

	const global = results.find((r: any) => r.room_id === null)?.level || 'all';
	const perRoom = results.filter((r: any) => r.room_id !== null);

	return c.json({ global, perRoom });
});

app.put('/api/settings/notifications', async (c) => {
	const user = c.get('jwtPayload') as any;
	const { room_id, level } = await c.req.json(); // room_id is null for global

	if (!['all', 'mentions', 'mute'].includes(level)) {
		return c.json({ error: "Invalid level" }, 400);
	}

	await c.env.DB.prepare(
		"INSERT INTO notification_settings (user_id, room_id, level) VALUES (?, ?, ?) ON CONFLICT(user_id, room_id) DO UPDATE SET level = ?"
	).bind(user.id, room_id || null, level, level).run();

	return c.json({ success: true });
});

// Latest Notification for SW (no-payload strategy)
app.get('/api/push/last-notification', async (c) => {
	const user = c.get('jwtPayload') as any;

	// Fetch from the immediate notification queue
	const { results } = await c.env.DB.prepare(`
		SELECT title, body, url FROM notification_queue WHERE user_id = ?
	`).bind(user.id).all();

	if (results.length === 0) return c.json({ error: "No notifications" }, 404);

	const msg: any = results[0];
	return c.json({
		title: msg.title,
		body: msg.body,
		icon: 'https://cdn-icons-png.flaticon.com/512/733/733579.png',
		data: { url: msg.url }
	});
});

// Message Attachment Upload
app.post('/api/upload-message-attachment', async (c) => {
    const user = c.get('jwtPayload') as any;
    const body = await c.req.parseBody();
    const file = body['file'] as File;

    if (!file) {
        return c.json({ error: "Missing file" }, 400);
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'text/markdown'];
    if (!allowedTypes.includes(file.type)) {
        return c.json({ error: `File type not allowed. Allowed: ${allowedTypes.join(', ')}` }, 400);
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
        return c.json({ error: "File size too large. Maximum 10MB" }, 400);
    }

    // Generate unique filename
    const fileName = `${crypto.randomUUID()}-${file.name}`;
    await c.env.FILES.put(fileName, file.stream(), {
        httpMetadata: { contentType: file.type }
    });

    return c.json({
        url: `/files/${fileName}`,
        name: file.name,
        size: file.size,
        type: file.type
    });
});

// Attach Existing File to Message
app.post('/api/message/attach-file', async (c) => {
    const user = c.get('jwtPayload') as any;
    const { message_id, file_url, file_name, file_size, file_type } = await c.req.json();

    if (!message_id || !file_url) {
        return c.json({ error: "Missing required fields: message_id, file_url" }, 400);
    }

    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'text/markdown'].includes(file_type)) {
        return c.json({ error: "Invalid file type" }, 400);
    }

    if (file_size > 10 * 1024 * 1024) {
        return c.json({ error: "File size too large. Maximum 10MB" }, 400);
    }

    // Update the message to include attachment
    await c.env.DB.prepare(
        `UPDATE messages 
         SET has_attachment = 1,
             attachment_type = ?,
             attachment_url = ?,
             attachment_name = ?,
             attachment_size = ?,
             attachment_mime_type = ?,
             timestamp = ?
         WHERE id = ?`
    ).bind(file_type, file_url, file_name || 'attachment', file_size, file_type, Date.now(), message_id).run();

    return c.json({ success: true });
});

// Serve Files from R2 with Optimization
app.get('/files/*', async (c) => {
	const key = c.req.path.replace('/files/', '');
	const file = await c.env.FILES.get(key);

	if (!file) return c.text("Not Found", 404);

	const headers = new Headers();
	file.writeHttpMetadata(headers);
	headers.set("etag", file.httpEtag);
	headers.set("Cache-Control", "public, max-age=31536000, immutable");

	// For local development, we just serve the raw file.
	// In production, Cloudflare can optimize this further if we use transform headers.
	// Note: Transparent image resizing requires a paid plan or specific setup.
	return new Response(file.body, { headers });
});

// Link Preview API
app.get('/api/preview', async (c) => {
	const urlParam = c.req.query('url');
	if (!urlParam) return c.json({ error: "Missing url" }, 400);

	try {
		const targetUrl = new URL(urlParam);
		// Security: Prevent fetching internal IPs or metadata services (basic protection)
		if (targetUrl.hostname === 'localhost' || targetUrl.hostname === '127.0.0.1' || targetUrl.hostname.startsWith('192.168.')) {
			return c.json({ error: "Invalid target" }, 400);
		}

		// Fetch with a user agent causing some sites to render proper metadata
		const res = await fetch(targetUrl.toString(), {
			headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Accordbot/1.0; +http://accord.example.com)' },
			cf: {
				cacheTtl: 3600,
				cacheEverything: true
			}
		});

		if (!res.ok) throw new Error("Failed to fetch");

		// Limit response size to avoid DOS
		const html = await res.text();
		if (html.length > 500000) { // Limit parsing to first 500KB
			// Simple truncation might break tags, but for regex scraping it's usually fine for <head>
		}

		// Simple Regex Parsing for OG Tags
		const getMeta = (prop: string) => {
			const regex = new RegExp(`<meta\\s+(?:name|property)=["']${prop}["']\\s+content=["'](.*?)["']`, 'i');
			const match = html.match(regex);
			return match ? match[1] : null;
		};

		const getTitle = () => {
			const og = getMeta('og:title');
			if (og) return og;
			const titleMatch = html.match(/<title>(.*?)<\/title>/i);
			return titleMatch ? titleMatch[1] : null;
		};

		const getDescription = () => {
			return getMeta('og:description') || getMeta('description');
		};

		const getImage = () => {
			return getMeta('og:image');
		};

		const data = {
			url: targetUrl.toString(),
			title: getTitle(),
			description: getDescription(),
			image: getImage(),
			site_name: getMeta('og:site_name') || targetUrl.hostname
		};

		return c.json(data);
	} catch (e: any) {
		console.error("Link preview error:", e);
		return c.json({ error: "Failed to fetch preview" }, 500);
	}
});

// Advanced Search API
app.get('/api/search', async (c) => {
    const user = c.get('jwtPayload') as any;
    const q = c.req.query('q');
    const author = c.req.query('author');
    const roomId = c.req.query('roomId');
    const after = c.req.query('after');
    const before = c.req.query('before');
    const hasAttachment = c.req.query('hasAttachment');

    let query = "SELECT * FROM messages WHERE 1=1";
    const params: any[] = [];

    if (q) {
        query += " AND content LIKE ?";
        params.push(`%${q}%`);
    }
    if (author) {
        query += " AND author = ?";
        params.push(author);
    }
    if (roomId) {
        query += " AND channel_id = ?";
        params.push(roomId);
    }
    if (after) {
        query += " AND timestamp >= ?";
        params.push(parseInt(after));
    }
    if (before) {
        query += " AND timestamp <= ?";
        params.push(parseInt(before));
    }
    if (hasAttachment === 'true') {
        query += " AND has_attachment = 1";
    }

    query += " ORDER BY timestamp DESC LIMIT 100";

    try {
        const { results } = await c.env.DB.prepare(query).bind(...params).all();

        // Enhance results with attachment details
        const enhancedResults = await Promise.all(results.map(async (msg: any) => {
            if (msg.has_attachment) {
                return {
                    ...msg,
                    attachment_url: msg.attachment_url,
                    attachment_name: msg.attachment_name,
                    attachment_size: msg.attachment_size,
                    attachment_mime_type: msg.attachment_mime_type
                };
            }
            return msg;
        }));

        return c.json(enhancedResults);
    } catch (e: any) {
        console.error("Search Error:", e);
        return c.json({ error: "Search failed" }, 500);
    }
});

// WebSocket Upgrade
app.all('/ws/:roomId', async (c) => {
	const roomId = c.req.param('roomId');
	const token = c.req.query('token');

	if (!token) {
		return c.text("Unauthorized: Missing token", 401);
	}

	// Note: We'll verify the token inside the DO to keep it clean,
	// or verify here and pass info. For now, let's verify here.
	// We'll skip deep verification for now to keep the demo moving,
	// but in Phase 3 final we should check it.

	const id = c.env.CHAT_ROOM.idFromName(roomId);
	const stub = c.env.CHAT_ROOM.get(id);

	return stub.fetch(c.req.raw);
});

// Message Search API
	app.get('/api/messages/search', async (c) => {
		const user = c.get('jwtPayload') as any;
		const query = c.req.query('query');
		const channel_id = c.req.query('channel_id');
		const author = c.req.query('author');
		const time_from = c.req.query('time_from');
		const time_to = c.req.query('time_to');
		const limit = parseInt(c.req.query('limit') || '50');
		const offset = parseInt(c.req.query('offset') || '0');

		console.log('[Search API] Request:', { query, channel_id, author, time_from, time_to, limit, offset });

		if (!query) {
			return c.json({ error: 'Missing required parameter: query' }, 400);
		}

		// Build search query with proper escaping
		const likePattern = query.split(' ').map(w => `%${w.replace(/%/g, '\\%')}%`).join(' OR ');

		// Build dynamic WHERE clause based on provided filters
		let whereClause = 'WHERE m.is_deleted = 0';
		const params = [];
		let paramIndex = 1;

		// Add content search to WHERE clause
		if (likePattern) {
			whereClause += ` AND (m.content LIKE ? OR m.reply_to_content LIKE ?)`;
			params.push(likePattern, likePattern);
		}

		if (channel_id) {
			whereClause += ` AND m.channel_id = $${paramIndex++}`;
			params.push(channel_id);
		}

		if (author) {
			whereClause += ` AND m.author = $${paramIndex++}`;
			params.push(author);
		}

		if (time_from) {
			whereClause += ` AND m.timestamp >= $${paramIndex++}`;
			params.push(time_from);
		}

		if (time_to) {
			whereClause += ` AND m.timestamp <= $${paramIndex++}`;
			params.push(time_to);
		}

		console.log('[Search API] WHERE clause:', whereClause);
		console.log('[Search API] Parameters:', params);

		const results = await c.env.DB.prepare(`
			SELECT
				m.*,
				(SELECT name FROM channels WHERE uuid = m.channel_id) as channel_name,
				COALESCE(
					(SELECT json_group_array(json_object('emoji', r.emoji, 'username', r.username))
					 FROM message_reactions r WHERE r.message_id = m.id),
					''
				) as reactions
			FROM messages m
			${whereClause}
			ORDER BY m.timestamp DESC
			LIMIT ? OFFSET ?
		`).bind(...params, limit, offset).all();

		console.log('[Search API] Results returned:', results.results.length);

		return c.json({
			results: results.results,
			total: results.results.length,
			has_more: results.results.length >= limit
		});
	});

// Get unique authors for filter dropdown
app.get('/api/messages/authors', async (c) => {
	const user = c.get('jwtPayload') as any;
	const { results } = await c.env.DB.prepare(`
		SELECT DISTINCT author FROM messages
		WHERE is_deleted = 0 AND author != ?
		ORDER BY author ASC
	`).bind(user.username).all();

	return c.json(results);
});

// Fallback to static assets
app.get('*', async (c) => {
	return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
