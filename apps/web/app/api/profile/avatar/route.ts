import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { getSessionUser } from "@/lib/auth/session";
import { pool } from "@/lib/db";
import { withCacheBust } from "@/lib/avatar-url";

const AVATARS_DIR = path.join(process.cwd(), "public", "assets", "avatars");

/**
 * Stores only the file PATH in the DB — the real image bytes are written to
 * disk under public/assets/avatars/ (served statically by Next.js's /public
 * convention at the same path). Re-uploading overwrites the same filename
 * (keyed by user id), so the DB path string never needs to change on update.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { dataUrl } = (await request.json()) as { dataUrl: string };
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
  if (!match) {
    return NextResponse.json({ error: "Expected a PNG/JPEG data URL" }, { status: 400 });
  }
  const [, ext, base64] = match;
  const buffer = Buffer.from(base64, "base64");

  await mkdir(AVATARS_DIR, { recursive: true });
  const filename = `${user.id}.${ext === "jpeg" ? "jpg" : ext}`;
  await writeFile(path.join(AVATARS_DIR, filename), buffer);

  const avatarPath = `/assets/avatars/${filename}`;
  await pool.query("UPDATE users SET avatar_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [
    avatarPath,
    user.id,
  ]);

  // Cache-busted so the browser fetches the freshly-overwritten file
  // immediately instead of serving the previous cached image at this same
  // path (see lib/avatar-url.ts). The DB column itself stays a clean path.
  return NextResponse.json({ avatarUrl: withCacheBust(avatarPath, Date.now()) });
}
