"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

interface SessionRow {
  id: string;
  created_at: string;
  last_seen_at: string;
  conversation_count: number;
  message_count: number;
  first_user_message: string | null;
}

interface MessageRow {
  id: string;
  role: "user" | "bot";
  text: string | null;
  created_at: string;
  conversation_id: string;
  products: { name: string; brand: string | null; price: number | null }[];
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ConversationHistoryPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  useEffect(() => {
    fetch("/api/admin/sessions")
      .then(async (res) => {
        if (res.status === 401) {
          setAuthed(false);
          return;
        }
        const data = await res.json();
        setSessions(data.sessions ?? []);
        setAuthed(true);
      })
      .catch(() => setAuthed(false));
  }, []);

  function selectSession(id: string) {
    setSelectedId(id);
    setLoadingMessages(true);
    setMessages([]);
    fetch(`/api/admin/sessions/${id}`)
      .then((r) => r.json())
      .then((d) => setMessages(d.messages ?? []))
      .catch(() => setMessages([]))
      .finally(() => setLoadingMessages(false));
  }

  if (authed !== true) {
    return (
      <div
        className="fixed inset-0 z-[999999] flex items-center justify-center bg-neutral-50 text-neutral-900"
        style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
      >
        {authed === false ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
            <p className="mb-4 text-sm text-neutral-600">Sesi admin tidak ditemukan.</p>
            <Link href="/admin" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
              Ke halaman masuk
            </Link>
          </div>
        ) : null}
      </div>
    );
  }

  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  return (
    <div
      className="fixed inset-0 z-[999999] overflow-hidden bg-neutral-50 text-neutral-900"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
    >
      <div className="flex h-full w-full">
        <AdminSidebar active="conversations" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-neutral-200 bg-white px-6 py-4">
            <h1 className="text-xl font-bold text-neutral-900">Conversation history</h1>
            <p className="mt-0.5 text-xs text-neutral-500">
              Semua sesi percakapan widget pelanggan, dibaca langsung dari tabel widget di database.
            </p>
          </div>

          <div className="flex min-h-0 flex-1">
            {/* Session list */}
            <div className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-neutral-200 bg-white">
              {sessions.length === 0 && <p className="p-4 text-sm text-neutral-400">Belum ada percakapan.</p>}
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => selectSession(s.id)}
                  className={`border-b border-neutral-100 px-4 py-3 text-left transition ${
                    selectedId === s.id ? "bg-primary-dim" : "hover:bg-neutral-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-neutral-500">sesi {s.id.slice(0, 8)}</span>
                    <span className="text-[11px] text-neutral-400">{formatDate(s.last_seen_at)}</span>
                  </div>
                  <div className="mt-1 line-clamp-2 text-[13px] font-medium text-neutral-800">
                    {s.first_user_message?.trim() || <span className="font-normal text-neutral-400">(belum ada pesan)</span>}
                  </div>
                  <div className="mt-1 text-[11px] text-neutral-400">
                    {s.message_count} pesan · {s.conversation_count} percakapan
                  </div>
                </button>
              ))}
            </div>

            {/* Detail transcript */}
            <div className="flex min-h-0 flex-1 flex-col bg-neutral-50">
              {!selected ? (
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-sm text-neutral-400">Pilih sesi untuk melihat isi chat.</p>
                </div>
              ) : (
                <>
                  <div className="border-b border-neutral-200 bg-white px-6 py-3">
                    <div className="text-sm font-semibold text-neutral-800">Sesi {selected.id.slice(0, 8)}</div>
                    <div className="text-[11px] text-neutral-400">
                      Mulai {formatDate(selected.created_at)} · {selected.message_count} pesan ·{" "}
                      {selected.conversation_count} percakapan
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6">
                    <div className="mx-auto flex max-w-2xl flex-col gap-3">
                      {loadingMessages && <p className="text-center text-sm text-neutral-400">Memuat…</p>}
                      {!loadingMessages && messages.length === 0 && (
                        <p className="text-center text-sm text-neutral-400">Tidak ada pesan.</p>
                      )}
                      {messages.map((m, i) => {
                        const newConversation = i > 0 && messages[i - 1].conversation_id !== m.conversation_id;
                        return (
                          <div key={m.id} className="flex flex-col gap-3">
                            {newConversation && (
                              <div className="my-1 flex items-center gap-3">
                                <div className="h-px flex-1 bg-neutral-200" />
                                <span className="text-[10px] font-semibold tracking-wide text-neutral-400 uppercase">
                                  Percakapan baru
                                </span>
                                <div className="h-px flex-1 bg-neutral-200" />
                              </div>
                            )}
                            <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                              <div
                                className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                                  m.role === "user" ? "bg-primary text-white" : "bg-white text-neutral-800 shadow-sm"
                                }`}
                              >
                                <div className="whitespace-pre-wrap">{m.text}</div>
                                {m.products.length > 0 && (
                                  <div className="mt-2 flex flex-col gap-1 border-t border-black/10 pt-2">
                                    {m.products.map((p, j) => (
                                      <div key={i + "-" + j} className="text-[11px] opacity-80">
                                        {p.name}
                                        {p.brand ? ` · ${p.brand}` : ""}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className={`mt-1 text-[10px] ${m.role === "user" ? "text-white/70" : "text-neutral-400"}`}>
                                  {formatDate(m.created_at)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
