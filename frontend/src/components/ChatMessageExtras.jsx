import { useEffect, useMemo, useRef, useState } from "react";
import { APP_BASE_URL, api } from "../services/api";
import Icon from "./Icon";

const formatFileSize = (bytes) => {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const fileNameFromDisposition = (value, fallback) => {
  const encoded = String(value || "").match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch (_error) {
      return fallback;
    }
  }
  return String(value || "").match(/filename="?([^";]+)"?/i)?.[1] || fallback;
};

function SecureAttachment({ attachment, token, mine, compact = false }) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(Boolean(attachment.is_image));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!attachment.is_image) return undefined;
    let active = true;
    let objectUrl = "";
    setLoading(true);
    api
      .getChatAttachment(attachment.id, token, "thumbnail")
      .then(({ blob }) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || "Preview unavailable");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, attachment.is_image, token]);

  const download = async () => {
    try {
      setError("");
      const result = await api.getChatAttachment(attachment.id, token);
      const objectUrl = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileNameFromDisposition(
        result.contentDisposition,
        attachment.original_name || "attachment"
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (requestError) {
      setError(requestError.message || "Download failed");
    }
  };

  if (attachment.is_image) {
    return (
      <div className="mt-2 overflow-hidden rounded-xl border border-black/10 bg-white/95 text-slate-800">
        <button type="button" onClick={download} className="block w-full text-left">
          <div className={`flex items-center justify-center bg-slate-100 ${compact ? "min-h-24" : "min-h-36"}`}>
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={attachment.original_name}
                className={`w-full object-contain ${compact ? "max-h-44" : "max-h-72"}`}
              />
            ) : (
              <span className="p-6 text-xs text-slate-400">
                {loading ? "Loading image…" : error || "Image unavailable"}
              </span>
            )}
          </div>
          <span className="flex items-center justify-between gap-3 px-3 py-2 text-[10px]">
            <span className="min-w-0 truncate font-semibold">{attachment.original_name}</span>
            <span className="shrink-0 text-slate-400">{formatFileSize(attachment.size_bytes)}</span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={download}
      className={`mt-2 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${
        mine ? "border-white/25 bg-white/10 text-white" : "border-slate-200 bg-slate-50 text-slate-800"
      }`}
    >
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${mine ? "bg-white/15" : "bg-indigo-100 text-indigo-700"}`}>
        <Icon name="download" className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold">{attachment.original_name}</span>
        <span className={`block text-[10px] ${mine ? "text-indigo-100" : "text-slate-400"}`}>
          {formatFileSize(attachment.size_bytes)} · Download
        </span>
        {error ? <span className="block text-[10px] text-red-300">{error}</span> : null}
      </span>
    </button>
  );
}

function SecureAudioAttachment({ attachment, token, mine }) {
  const [audioUrl, setAudioUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    api
      .getChatAttachment(attachment.id, token)
      .then(({ blob }) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setAudioUrl(objectUrl);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || "Voice message unavailable");
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, token]);

  return (
    <div
      className={`mt-2 min-w-[230px] rounded-xl border px-3 py-2.5 ${
        mine
          ? "border-white/25 bg-white/10 text-white"
          : "border-slate-200 bg-slate-50 text-slate-800"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-3 text-[10px]">
        <span className="flex items-center gap-1.5 font-semibold">
          <Icon name="microphone" className="h-3.5 w-3.5" />
          Voice message
        </span>
        <span className={mine ? "text-indigo-100" : "text-slate-400"}>
          {formatFileSize(attachment.size_bytes)}
        </span>
      </div>
      {audioUrl ? (
        <audio controls preload="metadata" src={audioUrl} className="h-9 w-full min-w-0" />
      ) : (
        <p className={`py-1 text-[10px] ${error ? "text-red-500" : mine ? "text-indigo-100" : "text-slate-400"}`}>
          {error || "Loading voice message…"}
        </p>
      )}
    </div>
  );
}

function ReferenceCard({ reference, mine, compact = false }) {
  const snapshot = reference?.snapshot || {};
  const product = reference?.type === "PRODUCT";
  const title = product
    ? snapshot.article_code || snapshot.name || `Product #${reference.reference_id}`
    : `Order #${snapshot.id || reference.reference_id}`;
  const subtitle = product
    ? [snapshot.sole_code, snapshot.color, snapshot.size].filter(Boolean).join(" · ")
    : [snapshot.customer_name, snapshot.delivery_note_number, snapshot.status]
        .filter(Boolean)
        .join(" · ");

  return (
    <div className={`mt-2 overflow-hidden rounded-xl border text-left ${mine ? "border-white/25 bg-white/10" : "border-slate-200 bg-slate-50"}`}>
      <div className="flex items-center gap-3 p-2.5">
        {product && snapshot.image_url ? (
          <img
            src={`${APP_BASE_URL}${snapshot.image_url}`}
            alt=""
            loading="lazy"
            className={`${compact ? "h-12 w-12" : "h-14 w-14"} shrink-0 rounded-lg bg-white object-cover`}
          />
        ) : (
          <span className={`inline-flex ${compact ? "h-10 w-10" : "h-12 w-12"} shrink-0 items-center justify-center rounded-lg ${mine ? "bg-white/15" : "bg-indigo-100 text-indigo-700"}`}>
            <Icon name={product ? "box" : "orders"} className="h-5 w-5" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className={`block text-[9px] font-bold uppercase tracking-wide ${mine ? "text-indigo-100" : "text-indigo-600"}`}>
            {product ? "Product reference" : "Order reference"}
          </span>
          <span className="block truncate text-xs font-bold">{title}</span>
          <span className={`block truncate text-[10px] ${mine ? "text-indigo-100" : "text-slate-500"}`}>
            {subtitle || "Saved chat reference"}
          </span>
          {!product ? (
            <span className={`mt-0.5 block text-[10px] ${mine ? "text-indigo-100" : "text-slate-500"}`}>
              {Number(snapshot.item_count || 0)} items · {Number(snapshot.total_quantity || 0).toLocaleString()} pairs
            </span>
          ) : null}
        </span>
        {product && snapshot.is_offer ? (
          <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-bold text-amber-800">OFFER</span>
        ) : null}
      </div>
    </div>
  );
}

export function ChatMessageExtras({ message, token, mine, compact = false }) {
  return (
    <>
      {message.reference ? (
        <ReferenceCard reference={message.reference} mine={mine} compact={compact} />
      ) : null}
      {(message.attachments || []).map((attachment) => (
        attachment.is_audio || String(attachment.mime_type || "").startsWith("audio/") ? (
          <SecureAudioAttachment
            key={attachment.id}
            attachment={attachment}
            token={token}
            mine={mine}
          />
        ) : (
          <SecureAttachment
            key={attachment.id}
            attachment={attachment}
            token={token}
            mine={mine}
            compact={compact}
          />
        )
      ))}
    </>
  );
}

export function ChatMessageContent({
  message,
  token,
  mine,
  compact = false,
  onUpdated,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.message || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) setDraft(message.message || "");
  }, [editing, message.message]);

  const saveEdit = async () => {
    const value = draft.trim();
    if (!value || saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await api.editChatMessage(message.id, value, token);
      if (result.data) onUpdated?.(result.data);
      setEditing(false);
    } catch (requestError) {
      setError(requestError.message || "Could not edit this message.");
    } finally {
      setSaving(false);
    }
  };

  const removeMessage = async () => {
    if (saving) return;
    const confirmed = window.confirm(
      "Delete this message for everyone? This cannot be undone."
    );
    if (!confirmed) return;
    setSaving(true);
    setError("");
    try {
      const result = await api.deleteChatMessage(message.id, token);
      if (result.data) onUpdated?.(result.data);
      setEditing(false);
    } catch (requestError) {
      setError(requestError.message || "Could not delete this message.");
    } finally {
      setSaving(false);
    }
  };

  const actionClass = mine
    ? "text-indigo-100 hover:bg-white/10 hover:text-white"
    : "text-slate-400 hover:bg-slate-100 hover:text-slate-700";

  return (
    <>
      {editing ? (
        <div className="mt-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={compact ? 2 : 3}
            maxLength={4000}
            autoFocus
            className="w-full resize-none rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm leading-5 text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setDraft(message.message || "");
                setEditing(false);
                setError("");
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                saveEdit();
              }
            }}
          />
          <div className="mt-1.5 flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setDraft(message.message || "");
                setEditing(false);
                setError("");
              }}
              className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || !draft.trim()}
              onClick={saveEdit}
              className="rounded-lg bg-indigo-700 px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <p
          className={`${compact ? "mt-0.5 text-[13px] leading-5" : "mt-1 text-sm leading-6"} whitespace-pre-wrap break-words ${
            message.is_deleted ? "italic opacity-70" : ""
          }`}
        >
          {message.message}
        </p>
      )}

      {!message.is_deleted && !editing ? (
        <ChatMessageExtras message={message} token={token} mine={mine} compact={compact} />
      ) : null}

      {!editing && (message.edited_at || (mine && !message.is_deleted)) ? (
        <div className={`mt-1 flex items-center gap-1 ${compact ? "text-[9px]" : "text-[10px]"}`}>
          {message.edited_at ? <span className={mine ? "text-indigo-200" : "text-slate-400"}>Edited</span> : null}
          {mine && !message.is_deleted ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setDraft(message.message || "");
                  setEditing(true);
                  setError("");
                }}
                className={`rounded px-1.5 py-0.5 font-semibold disabled:opacity-50 ${actionClass}`}
              >
                Edit
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={removeMessage}
                className={`rounded px-1.5 py-0.5 font-semibold disabled:opacity-50 ${actionClass}`}
              >
                Delete
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className={`mt-1 text-[10px] ${mine ? "text-red-100" : "text-red-600"}`}>{error}</p>
      ) : null}
    </>
  );
}

export function ChatReferencePicker({ open, token, conversationId, staffConversation = false, onClose, onSelect, sending }) {
  const [type, setType] = useState("PRODUCT");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    api
      .getChatReferenceOptions(type, debouncedSearch, token, conversationId)
      .then((result) => {
        if (requestId.current === currentRequest) setRows(result.data || []);
      })
      .catch((requestError) => {
        if (requestId.current === currentRequest) {
          setError(requestError.message || "Could not load references.");
          setRows([]);
        }
      })
      .finally(() => {
        if (requestId.current === currentRequest) setLoading(false);
      });
  }, [conversationId, debouncedSearch, open, token, type]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setRows([]);
      setError("");
    }
  }, [open]);

  const title = useMemo(() => (type === "PRODUCT" ? "Share a product" : "Share an order"), [type]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm" onMouseDown={onClose}>
      <section className="flex max-h-[min(680px,90vh)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500">
              {type === "PRODUCT" && conversationId
                ? staffConversation
                  ? "Staff can share products from the administrative catalogue."
                  : "Only products permitted to this customer are shown."
                : "Only records you are allowed to access are shown."}
            </p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100" aria-label="Close">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </header>
        <div className="space-y-3 border-b border-slate-200 p-4">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            {["PRODUCT", "ORDER"].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                className={`rounded-lg px-3 py-2 text-xs font-bold ${type === value ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}
              >
                {value === "PRODUCT" ? "Products" : "Orders"}
              </button>
            ))}
          </div>
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={type === "PRODUCT" ? "Search article, colour or series…" : "Search order, DN or customer…"}
              className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
              autoFocus
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {error ? <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</div> : null}
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Loading…</div>
          ) : rows.length ? (
            <div className="space-y-2">
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  disabled={sending}
                  onClick={() => onSelect({ reference_type: type, reference_id: row.id })}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
                >
                  {type === "PRODUCT" && row.image_url ? (
                    <img src={`${APP_BASE_URL}${row.image_url}`} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg bg-slate-100 object-cover" />
                  ) : (
                    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                      <Icon name={type === "PRODUCT" ? "box" : "orders"} className="h-5 w-5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900">
                      {type === "PRODUCT" ? row.article_code || row.name : `Order #${row.id}`}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {type === "PRODUCT"
                        ? [row.sole_code, row.color, row.size].filter(Boolean).join(" · ")
                        : [row.customer_name, row.delivery_note_number, row.status].filter(Boolean).join(" · ")}
                    </span>
                    {type === "ORDER" ? (
                      <span className="block truncate text-[10px] text-slate-400">{row.item_count} items · {Number(row.total_quantity || 0).toLocaleString()} pairs</span>
                    ) : null}
                  </span>
                  <span className="text-xs font-bold text-indigo-600">Share</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">No matching records found.</div>
          )}
        </div>
      </section>
    </div>
  );
}
