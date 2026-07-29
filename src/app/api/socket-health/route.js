import { NextResponse } from "next/server";

// GET /api/socket-health -> Check if socket server is reachable
export async function GET() {
  const SOCKET_SERVER_URL = process.env.SOCKET_SERVER_URL || "http://localhost:4000";
  
  try {
    const res = await fetch(`${SOCKET_SERVER_URL}/health`, { timeout: 3000 });
    if (res.ok) {
      return NextResponse.json({ 
        status: "✅ Connected",
        url: SOCKET_SERVER_URL,
        message: "Socket server is running and reachable"
      });
    }
  } catch (err) {
    return NextResponse.json({ 
      status: "❌ Unreachable",
      url: SOCKET_SERVER_URL,
      error: err.code || err.message,
      message: "Socket server is not responding. Make sure to run: npm run socket",
      suggestion: "Run 'npm run socket' in a separate terminal to start the socket server on port 4000"
    }, { status: 503 });
  }
}
