import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth/admin-session";
import { updateEvent, deleteEvent } from "@/lib/events";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { status?: string; milestonesDone?: string[] } | null;
  if (!body?.status && !body?.milestonesDone) return NextResponse.json({ error: "missing_status" }, { status: 400 });
  await updateEvent(id, {
    status: body.status as "rencana" | "disetujui" | "berjalan" | "selesai" | "batal" | undefined,
    milestonesDone: body.milestonesDone,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await deleteEvent(id);
  return NextResponse.json({ ok: true });
}
