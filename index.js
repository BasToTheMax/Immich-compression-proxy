import express from "express";
import multer from "multer";
import sharp from "sharp";
import fetch from "node-fetch";
import FormData from "form-data";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const app = express();
const upload = multer();
const IMMICH_URL = process.env.IMMICH_URL || "http://localhost:2283"; // change if needed

// let SIZE_W = 1920;
// let SIZE_H = 1080;

let SIZE_W = 2560;
let SIZE_H = 1440;

// Utility: check token validity (simple HEAD request to Immich)
async function verifyAuth(req) {
  if (!req) return false;
  try {
    const resp = await fetch(`${IMMICH_URL}/api/users/me`, {
      headers: req.headers
    });
    return resp.ok;
  } catch {
    return false;
  }
}

app.post("/api/assets", upload.single("assetData"), async (req, res) => {
  if (!(await verifyAuth(req))) {
    return res.status(401).json({ error: "Invalid or missing Immich token" });
  }

  let hasResponsed = false;
  
  if (!req.file) return res.status(400).send("No file uploaded");
  const filename = req.file.originalname;
  const ext = path.extname(filename).replace('.', '');
  let buffer = req.file.buffer;

  console.log('> Handling file upload!');

  try {
    if (
   		ext == 'png' ||
   		ext == 'jpg' ||
   		ext == 'jpeg' ||
   		ext == 'webp' ||
   		ext == 'avif'
   	) {
      let image = sharp(buffer).rotate(); // auto-orient
      const meta = await image.metadata();

      // Resize if larger than 1080p
      if (meta.width > SIZE_W || meta.height > SIZE_H) {
      	let resizeOptions = {
      		kernel: "lanczos3",
      		withoutEnlargement: true,
      		fit: "inside"
      	}
      	if (meta.width > meta.height) {
      		// Image is horizontal
      		image = image.resize({ ...resizeOptions, width: SIZE_W, height: SIZE_H });
      	} else {
      		// Image is vertical
      		image = image.resize({ ...resizeOptions, width: SIZE_H, height: SIZE_W });
      	}
        console.log(` | Resized image to ${SIZE_H}p`);
      }
      
      // Re-encode to webp if different format
      const shouldReencode = meta.format !== "webp";

      if (shouldReencode) {
        buffer = await image.webp({ quality: 100, effort: 6, preset: "photo" }).toBuffer();
        console.log(' | Re-encoded image to webp');
      } else {
      	console.log(' | Image is already webp!');
        buffer = await image.toBuffer();
      }

    } else {

		console.log(` | Invalid ext: ${ext}`);
    	
    }

  } catch (err) {
    console.error("Processing error:", err);
    return res.status(500).send("Failed to process file");
  }

  // Forward to Immich
  const form = new FormData();
  form.append("assetData", buffer, { filename: req.file.originalname, contentType: req.file.mimetype });
  for (const [key, value] of Object.entries(req.body)) form.append(key, value);

  try {
    const resp = await fetch(`${IMMICH_URL}/api/assets`, {
      method: "POST",
      headers: req.headers,
      body: form,
    });

    const text = await resp.text();
    if (hasResponsed == false) {
    	res.set('X-AssetStatus', 'Compressed').status(resp.status).send(text);
    }

    console.log(` | Asset uploaded!`);
  } catch (err) {
    console.error("Forwarding error:", err);
    res.status(502).send("Failed to contact Immich");
  }
});

app.listen(3000, () => {
  console.log("Immich Resize Proxy running on port 3000");
});
