import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // API route to proxy Supabase requests
  app.post("/api/supabase", async (req, res) => {
    const { url, method, headers, body } = req.body;

    if (!url) {
      return res.status(400).json({ error: "Missing URL in request body" });
    }

    console.log(`Proxying ${method || "GET"} request to: ${url}`);

    try {
      const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2YWZkaHl1ZHZkeW1sZXRxamVlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTkzMDQ3NiwiZXhwIjoyMDc3NTA2NDc2fQ.y_D64FZILeOCFwAbZZaN0TqFVcpD3VSE9nJWPt_ypCc";

      // Create a clean headers object without any existing apikey to ensure ours is used
      const cleanHeaders = new Headers();
      if (headers) {
        for (const [key, value] of Object.entries(headers)) {
          if (key.toLowerCase() !== 'apikey' && key.toLowerCase() !== 'authorization' && key.toLowerCase() !== 'host') {
             cleanHeaders.set(key, value as string);
          }
        }
      }
      
      cleanHeaders.set('apikey', supabaseKey);
      cleanHeaders.set('Authorization', headers?.Authorization || `Bearer ${supabaseKey}`);

      const fetchOptions: RequestInit = {
        method: method || "GET",
        headers: cleanHeaders,
      };

      if (body && method !== "GET" && method !== "HEAD") {
        fetchOptions.body =
          typeof body === "string" ? body : JSON.stringify(body);
      }

      console.log("Sending proxy request headers:", fetchOptions.headers);

      const response = await fetch(url, fetchOptions);

      // Handle 204 No Content
      if (response.status === 204) {
        return res.status(204).send();
      }

      // Forward headers
      response.headers.forEach((value, key) => {
        // Skip some headers that might cause issues
        if (
          !["content-encoding", "content-length", "transfer-encoding"].includes(
            key.toLowerCase(),
          )
        ) {
          res.setHeader(key, value);
        }
      });

      const buffer = await response.arrayBuffer();
      console.log(
        `Proxy response: ${response.status}, size: ${buffer.byteLength} bytes`,
      );
      res.status(response.status).send(Buffer.from(buffer));
    } catch (error) {
      console.error("Proxy fetch error:", error);
      res.status(500).json({
        error: "Failed to proxy request",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(
      `Supabase URL configured: ${process.env.VITE_SUPABASE_URL ? "Yes" : "No"}`,
    );
    console.log(
      `Supabase Key configured: ${process.env.VITE_SUPABASE_ANON_KEY ? "Yes" : "No"}`,
    );
  });
}

startServer();
