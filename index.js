import express from "express";
import multer from "multer";
import sharp from "sharp";
import fetch, { FormData, File } from "node-fetch";
import { FormDataEncoder } from "form-data-encoder";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
// import { fetch, FormData } from "undici";
// import { File } from "node-fetch";

const app = express();
const upload = multer();
const IMMICH_URL = process.env.IMMICH_URL || "http://localhost:2283"; // change if needed

let SIZE_W = 2560;
let SIZE_H = 1440;

// Utility: check token validity (simple GET to Immich user endpoint)
async function verifyAuth(req) {
  if (!req) return false;
  try {
    const resp = await fetch(`${IMMICH_URL}/api/users/me`, {
      headers: req.headers,
    });
    return resp.ok;
  } catch (err) {
    console.error("> Failed to check auth!", err);
    return false;
  }
}

app.post("/api/assets", upload.single("assetData"), async (req, res) => {
  if (!(await verifyAuth(req))) {
    return res.status(401).json({ error: "Invalid or missing Immich token" });
  }

  if (!req.file) return res.status(400).send("No file uploaded");
  const filename = req.file.originalname;
  const ext = path.extname(filename).replace(".", "");
  let buffer = req.file.buffer;

  console.log("> Handling file upload!", req.headers);

  try {
    if (
      ext === "png" ||
      ext === "jpg" ||
      ext === "jpeg" ||
      ext === "webp" ||
      ext === "avif"
    ) {
      let image = sharp(buffer).rotate(); // auto-orient
      const meta = await image.metadata();

      // Resize if larger than configured
      if (meta.width > SIZE_W || meta.height > SIZE_H) {
        const resizeOptions = {
          kernel: "lanczos3",
          withoutEnlargement: true,
          fit: "inside",
        };
        if (meta.width > meta.height) {
          // horizontal
          image = image.resize({ ...resizeOptions, width: SIZE_W, height: SIZE_H });
        } else {
          // vertical
          image = image.resize({ ...resizeOptions, width: SIZE_H, height: SIZE_W });
        }
        console.log(` | Resized image to ${SIZE_H}p`);
      }

      image = await image.webp({ quality: 100, effort: 6, preset: "photo" });
      console.log(" | Re-encoded image to webp");

      buffer = await image.toBuffer();
      console.log(` | Buffer length: ${buffer.length}`);
    } else {
      console.log(` | Invalid ext: ${ext}`);
    }
  } catch (err) {
    console.error("Processing error:", err);
    return res.status(500).send("Failed to process file");
  }

  console.log(" | Uploading image to Immich....");

  try {
    // Build web FormData using node-fetch's FormData/File
    const form = new FormData();
    const newFilename = `image-${Date.now()}.webp`;
    form.set("assetData", new File(buffer, newFilename, { type: "image/webp" }));

    // copy over any extra form fields from original request body
    for (const [key, value] of Object.entries(req.body || {})) {
      console.log(` | Added "${key}" to body form`);
      // FormData.set will overwrite, append if you expect multiple
      form.set(key, value);
    }

    // Encode form-data to produce proper headers (Content-Type with boundary and Content-Length when possible)
    const encoder = new FormDataEncoder(form);
    const encoderHeaders = { ...encoder.headers }; // contains content-type and maybe content-length

    // Merge headers: encoder headers + auth/cookie headers carried from original request
    const headers = {
      ...encoderHeaders,
      Accept: "*/*",
    };

    const headerKeys = [
      "cookie",
      "x-api-key",
      "x-immich-user-token",
      "x-immich-sesion-token",
      "x-immich-share-key",
      "x-immich-share-slug",
    ];
    for (const hk of headerKeys) {
      if (req.headers[hk]) headers[hk] = req.headers[hk];
    }

    console.log(" | Using headers:", headers);

    console.log(encoder.encode(), typeof encoder.encode())

    // encoder.encode() returns an async iterable / ReadableStream of Uint8Array
    const resp = await fetch(`${IMMICH_URL}/api/assets`, {
      method: "POST",
      headers,
      body: encoder.encode(),
      maxBodyLength: Infinity
    });

    const text = await resp.text();
    res.set("X-AssetStatus", "Compressed").status(resp.status).send(text);

    console.log(" | Asset uploaded! status:", resp.status);
  } catch (err) {
    console.error("> Forwarding error:", err);
    res.status(502).type("txt").send("Failed to contact Immich");
  }
});

app.listen(3000, () => {
  console.log("Immich Resize Proxy running on port 3000");
});
