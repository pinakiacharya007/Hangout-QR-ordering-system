import { NextResponse } from "next/server";
import os from "os";

// Returns the local network IP address (for QR codes and local network access)
export async function GET() {
  try {
    const interfaces = os.networkInterfaces();
    let localIp = "localhost";

    // Find the first non-internal IPv4 address
    for (const name of Object.keys(interfaces)) {
      const ifaces = interfaces[name];
      for (const iface of ifaces) {
        // Skip internal and non-IPv4 addresses
        if (iface.family === "IPv4" && !iface.internal) {
          localIp = iface.address;
          break;
        }
      }
      if (localIp !== "localhost") break;
    }

    return NextResponse.json({ localIp });
  } catch (err) {
    console.error("Failed to get local IP:", err);
    return NextResponse.json({ localIp: "localhost" });
  }
}
