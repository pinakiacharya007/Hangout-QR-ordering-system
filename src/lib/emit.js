// Sends an event to the standalone socket server (socket-server.js)
// so it can broadcast it to the right Socket.io room.
const SOCKET_SERVER_URL = process.env.SOCKET_SERVER_URL || "http://localhost:4000";

export async function emitToRoom(room, event, data, { timeoutMs = 5000 } = {}) {
  const url = `${SOCKET_SERVER_URL}/emit`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room, event, data }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "<no-body>");
      console.error(`[emit] ❌ Socket server returned ${res.status} ${res.statusText}: ${body}`);
      return false;
    }

    console.log(`[emit] ✓ room=${room} event=${event}`);
    return true;
  } catch (err) {
    // Don't crash the request if the socket server is down or slow to respond —
    // the DB write already succeeded, real-time update just won't fire this time.
    // The AbortController above is what actually enforces this — without it, a
    // hung connection to the socket server blocks the whole request indefinitely.
    if (err.name === "AbortError") {
      console.error(`[emit] ❌ Timed out reaching socket server at ${url} after ${timeoutMs}ms`);
    } else {
      console.error(`[emit] ❌ Failed to reach socket server at ${url}`);
      console.error(`[emit] Error: ${err.code || err.message}`);
    }
    return false;
  } finally {
    clearTimeout(timer);
  }
}