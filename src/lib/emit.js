// Sends an event to the standalone socket server (socket-server.js)
// so it can broadcast it to the right Socket.io room.
const SOCKET_SERVER_URL = process.env.SOCKET_SERVER_URL || "http://localhost:4000";

export async function emitToRoom(room, event, data) {
  const url = `${SOCKET_SERVER_URL}/emit`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room, event, data }),
      timeout: 5000, // 5 second timeout
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "<no-body>");
      console.error(`[emit] ❌ Socket server returned ${res.status} ${res.statusText}: ${body}`);
      return false;
    }

    console.log(`[emit] ✓ room=${room} event=${event}`);
    return true;
  } catch (err) {
    // Don't crash the request if the socket server is down —
    // the DB write already succeeded, real-time update just won't fire.
    console.error(`[emit] ❌ Failed to reach socket server at ${url}`);
    console.error(`[emit] Error: ${err.code || err.message}`);
    console.error(`[emit] ℹ️  Make sure socket server is running: npm run socket`);
    return false;
  }
}
