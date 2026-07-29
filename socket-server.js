// TableTap - Standalone real-time server
// Runs separately from Next.js since serverless hosts (Vercel) can't hold persistent WebSocket connections.
// Next.js API routes call POST /emit here after writing to the DB, and this server
// broadcasts to the right Socket.io room. Kitchen dashboards & customer devices connect
// directly to this server over Socket.io.

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  console.log(`[socket] connected: ${socket.id}`);

  // Clients join a room to scope updates:
  // - restaurant admin dashboard joins `restaurant-<restaurantId>`
  // - a customer device joins `table-<sessionId>`
  socket.on("join", (room) => {
    socket.join(room);
    console.log(`[socket] ${socket.id} joined room: ${room}`);
  });

  socket.on("leave", (room) => {
    socket.leave(room);
  });

  socket.on("disconnect", () => {
    console.log(`[socket] disconnected: ${socket.id}`);
  });
});

// Next.js API routes call this after a DB write to broadcast the update.
app.post("/emit", (req, res) => {
  const { room, event, data } = req.body || {};
  if (!room || !event) {
    return res.status(400).json({ error: "room and event are required" });
  }
  io.to(room).emit(event, data);
  console.log(`[emit] room=${room} event=${event}`);
  res.json({ ok: true });
});

app.get("/", (req, res) => {
  res.send("TableTap socket server is running.");
});

// Health endpoint for quick diagnostics (used by emit callers during local dev)
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || process.env.SOCKET_PORT || 4000;
server.listen(PORT, () => {
  console.log(`TableTap socket server listening on http://localhost:${PORT}`);
});
