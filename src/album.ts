import { HttpError } from "./http";

// The hidden photo album. art/scripts/album.py uploads the web copies and the page list to KV.
// A photo's file name is a hash of its bytes, so a photo never changes under its name.
const PHOTO = /^\/album\/([a-f0-9]{16}\.jpg)$/;
const LIST_SECONDS = 300;
const PHOTO_SECONDS = 31536000;

export async function albumList(env: Env): Promise<Response> {
  const list = await env.ALBUM.get("list", { cacheTtl: LIST_SECONDS });
  if (!list) throw new HttpError(404, "not_found");
  return new Response(list, {
    headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${LIST_SECONDS}` },
  });
}

export async function albumPhoto(env: Env, path: string): Promise<Response> {
  const name = PHOTO.exec(path)?.[1];
  if (!name) throw new HttpError(404, "not_found");
  const photo = await env.ALBUM.get(`photo:${name}`, { type: "arrayBuffer", cacheTtl: 86400 });
  if (!photo) throw new HttpError(404, "not_found");
  return new Response(photo, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": `public, max-age=${PHOTO_SECONDS}, immutable` },
  });
}
