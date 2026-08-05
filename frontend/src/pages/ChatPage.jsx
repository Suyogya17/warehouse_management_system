import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "../components/Button";
import { ChatMessageContent, ChatReferencePicker } from "../components/ChatMessageExtras";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import { PresenceDot, PresenceLabel } from "../components/ChatPresence";
import VoiceMessageRecorder from "../components/VoiceMessageRecorder";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { formatEnglishDate, formatTime } from "../utils/format";
import { normalizeRole } from "../utils/roles";

const ADMIN_ROLES = new Set(["ADMIN", "CO_ADMIN"]);
const POLL_MESSAGES_MS = 5000;
const POLL_INBOX_MS = 10000;

const mergeMessages = (current, incoming) => {
  const byId = new Map(current.map((message) => [Number(message.id), message]));
  incoming.forEach((message) => byId.set(Number(message.id), message));
  return [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id));
};

const messageDate = (value) => {
  if (!value) return "";
  return `${formatEnglishDate(value, { includeTime: false })} · ${formatTime(value)}`;
};

const initials = (name) =>
  String(name || "User")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

function MessageBubble({ message, currentUserId, currentUserRole, readState, token, staffConversation = false, onMessageUpdated }) {
  const mine = Number(message.sender_id) === Number(currentUserId);
  const viewerIsAdmin = ADMIN_ROLES.has(normalizeRole(currentUserRole));
  const readers = mine
    ? readState.filter((reader) => {
        if (staffConversation) {
          return (
            reader.last_read_message_id >= Number(message.id) &&
            Number(reader.user_id) !== Number(currentUserId)
          );
        }
        const readerIsAdmin = ADMIN_ROLES.has(normalizeRole(reader.role));
        return (
          reader.last_read_message_id >= Number(message.id) &&
          (viewerIsAdmin ? !readerIsAdmin : readerIsAdmin)
        );
      })
    : [];
  const receiptIcon = readers.length ? "✓✓" : "✓";

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[72%] ${
          mine
            ? "rounded-br-md bg-indigo-600 text-white"
            : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
        }`}
      >
        <p className={`text-xs font-semibold ${mine ? "text-indigo-100" : "text-indigo-700"}`}>
          {mine ? "You" : message.sender_name}
          {message.sender_role ? ` · ${message.sender_role}` : ""}
        </p>
        <ChatMessageContent
          message={message}
          token={token}
          mine={mine}
          onUpdated={onMessageUpdated}
        />
        <div className={`mt-1.5 flex items-center gap-2 text-[10px] ${mine ? "text-indigo-200" : "text-slate-400"}`}>
          <span>{messageDate(message.created_at)}</span>
          {mine ? (
            <span
              className="font-semibold"
              title={readers.length ? "Seen" : "Sent"}
              aria-label={readers.length ? "Seen" : "Sent"}
            >
              {receiptIcon}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Composer({ value, onChange, onSubmit, sending, disabled, onAttach, onReference, onError }) {
  const fileInputRef = useRef(null);
  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!disabled && value.trim()) onSubmit(event);
    }
  };

  return (
    <form onSubmit={onSubmit} className="border-t border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-50">
        <div className="flex shrink-0 items-center gap-1 pb-0.5">
          <button
            type="button"
            disabled={disabled || sending}
            onClick={onReference}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-indigo-600 hover:bg-indigo-100 disabled:opacity-40"
            title="Share product or order"
            aria-label="Share product or order"
          >
            <Icon name="ledger" className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={disabled || sending}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-indigo-600 hover:bg-indigo-100 disabled:opacity-40"
            title="Attach image or file"
            aria-label="Attach image or file"
          >
            <Icon name="attachment" className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/webp,application/pdf,.docx,.xlsx"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onAttach(file);
            }}
          />
          <VoiceMessageRecorder
            disabled={disabled || sending}
            onSend={onAttach}
            onError={onError}
          />
        </div>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          maxLength={4000}
          disabled={disabled || sending}
          placeholder="Write a message…"
          className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-400"
        />
        <Button
          type="submit"
          disabled={disabled || sending || !value.trim()}
          className="shrink-0"
        >
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
      <p className="mt-1.5 px-1 text-[10px] text-slate-400">
        Enter to send · Shift + Enter for a new line
      </p>
    </form>
  );
}

export default function ChatPage() {
  const { token, user } = useAuth();
  const role = normalizeRole(user?.role);
  const adminView = ADMIN_ROLES.has(role);
  const [staffMode, setStaffMode] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [supportPresence, setSupportPresence] = useState({ is_online: false });
  const [messages, setMessages] = useState([]);
  const [readState, setReadState] = useState([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
  const [error, setError] = useState("");
  const messageEndRef = useRef(null);
  const selectedIdRef = useRef(null);
  const lastMessageIdRef = useRef(0);
  const syncCursorRef = useRef("");
  const inboxRequestRef = useRef(false);
  const customerRequestRef = useRef(false);
  const adminMessageRequestRef = useRef(false);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    lastMessageIdRef.current = messages.length
      ? Number(messages[messages.length - 1].id)
      : 0;
  }, [messages]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const announceUnreadChange = useCallback(() => {
    window.dispatchEvent(new Event("nepcha:chat-unread-changed"));
  }, []);

  const updateMessage = useCallback((updatedMessage) => {
    setMessages((current) => mergeMessages(current, [updatedMessage]));
  }, []);

  const loadInbox = useCallback(async () => {
    if (!adminView || inboxRequestRef.current) return;
    inboxRequestRef.current = true;
    try {
      const [result, staffResult] = staffMode
        ? await Promise.all([
            api.getStaffChatConversations(token),
            api.getStaffChatUsers(token),
          ])
        : [
            await api.getChatConversations(token, {
              search: debouncedSearch,
              status,
            }),
            null,
          ];
      const rows = result.data || [];
      setConversations(rows);
      setStaffUsers(staffResult?.data || []);
      setSelectedId((current) => {
        if (current && rows.some((item) => Number(item.id) === Number(current))) return current;
        return rows[0]?.id || null;
      });
      setError("");
    } catch (requestError) {
      setError(requestError.message || "Could not load conversations.");
    } finally {
      inboxRequestRef.current = false;
      setLoading(false);
    }
  }, [adminView, debouncedSearch, staffMode, status, token]);

  const loadCustomerChat = useCallback(
    async (incremental = false) => {
      if (incremental && customerRequestRef.current) return;
      customerRequestRef.current = true;
      try {
        const afterId = incremental ? lastMessageIdRef.current : undefined;
        const result = await api.getMyChat(
          token,
          afterId,
          incremental ? syncCursorRef.current : undefined
        );
        const nextConversation = result.data?.conversation || null;
        const nextMessages = result.data?.messages || [];
        setReadState(result.data?.read_state || []);
        syncCursorRef.current = result.data?.sync_cursor || syncCursorRef.current;
        setSupportPresence(result.data?.support_presence || { is_online: false });
        setConversation(nextConversation);
        setMessages((current) => (incremental ? mergeMessages(current, nextMessages) : nextMessages));
        if (nextConversation && (nextMessages.length || !incremental)) {
          await api.markMyChatRead(token);
          announceUnreadChange();
        }
        setError("");
      } catch (requestError) {
        setError(requestError.message || "Could not load messages.");
      } finally {
        customerRequestRef.current = false;
        setLoading(false);
      }
    },
    [announceUnreadChange, token]
  );

  const loadAdminChat = useCallback(
    async (conversationId, incremental = false) => {
      if (!conversationId) return;
      if (incremental && adminMessageRequestRef.current) return;
      adminMessageRequestRef.current = true;
      try {
        const afterId = incremental ? lastMessageIdRef.current : undefined;
        const result = staffMode
          ? await api.getStaffChatConversation(
              conversationId,
              token,
              afterId,
              incremental ? syncCursorRef.current : undefined
            )
          : await api.getChatConversation(
              conversationId,
              token,
              afterId,
              incremental ? syncCursorRef.current : undefined
            );
        if (Number(selectedIdRef.current) !== Number(conversationId)) return;
        const nextMessages = result.data?.messages || [];
        syncCursorRef.current = result.data?.sync_cursor || syncCursorRef.current;
        setReadState(result.data?.read_state || []);
        setConversation(result.data?.conversation || null);
        setMessages((current) => (incremental ? mergeMessages(current, nextMessages) : nextMessages));
        if (nextMessages.length || !incremental) {
          if (staffMode) await api.markStaffChatRead(conversationId, token);
          else await api.markAdminChatRead(conversationId, token);
        }
        setConversations((current) =>
          current.map((item) =>
            Number(item.id) === Number(conversationId) ? { ...item, unread_count: 0 } : item
          )
        );
        announceUnreadChange();
        setError("");
      } catch (requestError) {
        setError(requestError.message || "Could not load messages.");
      } finally {
        adminMessageRequestRef.current = false;
        setLoading(false);
      }
    },
    [announceUnreadChange, staffMode, token]
  );

  useEffect(() => {
    setLoading(true);
    if (adminView) loadInbox();
    else loadCustomerChat(false);
  }, [adminView, loadCustomerChat, loadInbox]);

  useEffect(() => {
    if (!adminView || !selectedId) {
      if (adminView) {
        setConversation(null);
        setMessages([]);
        setReadState([]);
      }
      return;
    }
    setLoading(true);
    setMessages([]);
    setReadState([]);
    syncCursorRef.current = "";
    loadAdminChat(selectedId, false);
  }, [adminView, loadAdminChat, selectedId]);

  useEffect(() => {
    const poll = () => {
      if (document.visibilityState === "hidden") return;
      if (adminView) {
        loadInbox();
        if (selectedIdRef.current) loadAdminChat(selectedIdRef.current, true);
      } else {
        loadCustomerChat(true);
      }
    };
    const interval = window.setInterval(
      poll,
      adminView ? POLL_INBOX_MS : POLL_MESSAGES_MS
    );
    return () => window.clearInterval(interval);
  }, [adminView, loadAdminChat, loadCustomerChat, loadInbox]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, selectedId]);

  const submitMessage = async (event) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true);
    setError("");
    try {
      const result = adminView
        ? staffMode
          ? await api.sendStaffChatMessage(selectedId, message, token)
          : await api.sendAdminChatMessage(selectedId, message, token)
        : await api.sendMyChatMessage(message, token);
      setDraft("");
      if (result.data) setMessages((current) => mergeMessages(current, [result.data]));
      if (!adminView && !conversation) await loadCustomerChat(false);
      if (adminView) await loadInbox();
      announceUnreadChange();
    } catch (requestError) {
      setError(requestError.message || "Could not send the message.");
    } finally {
      setSending(false);
    }
  };

  const sendReference = async (reference) => {
    if (sending || (adminView && !selectedId)) return;
    setSending(true);
    setError("");
    try {
      const payload = { ...reference, ...(draft.trim() ? { message: draft.trim() } : {}) };
      const result = adminView
        ? staffMode
          ? await api.sendStaffChatReference(selectedId, payload, token)
          : await api.sendAdminChatReference(selectedId, payload, token)
        : await api.sendMyChatReference(payload, token);
      if (result.data) setMessages((current) => mergeMessages(current, [result.data]));
      setDraft("");
      setReferencePickerOpen(false);
      if (!adminView && !conversation) await loadCustomerChat(false);
      if (adminView) await loadInbox();
      announceUnreadChange();
    } catch (requestError) {
      setError(requestError.message || "Could not share this reference.");
    } finally {
      setSending(false);
    }
  };

  const sendAttachment = async (file) => {
    if (sending || (adminView && !selectedId)) return;
    setSending(true);
    setError("");
    try {
      const caption = draft.trim();
      const result = adminView
        ? staffMode
          ? await api.sendStaffChatAttachment(selectedId, file, caption, token)
          : await api.sendAdminChatAttachment(selectedId, file, caption, token)
        : await api.sendMyChatAttachment(file, caption, token);
      if (result.data) setMessages((current) => mergeMessages(current, [result.data]));
      setDraft("");
      if (!adminView && !conversation) await loadCustomerChat(false);
      if (adminView) await loadInbox();
      announceUnreadChange();
    } catch (requestError) {
      setError(requestError.message || "Could not upload this attachment.");
    } finally {
      setSending(false);
    }
  };

  const toggleStatus = async () => {
    if (!conversation || !adminView || staffMode) return;
    const nextStatus = conversation.status === "OPEN" ? "CLOSED" : "OPEN";
    try {
      await api.updateChatStatus(conversation.id, nextStatus, token);
      setConversation((current) => ({ ...current, status: nextStatus }));
      await loadInbox();
    } catch (requestError) {
      setError(requestError.message || "Could not update the conversation.");
    }
  };

  const selectedSummary = useMemo(
    () => conversations.find((item) => Number(item.id) === Number(selectedId)) || conversation,
    [conversation, conversations, selectedId]
  );

  const visibleConversations = useMemo(() => {
    if (!staffMode || !debouncedSearch) return conversations;
    const term = debouncedSearch.toLowerCase();
    return conversations.filter((item) =>
      `${item.user_name} ${item.user_email} ${item.user_role}`.toLowerCase().includes(term)
    );
  }, [conversations, debouncedSearch, staffMode]);

  const switchChatMode = (nextStaffMode) => {
    setStaffMode(nextStaffMode);
    setConversations([]);
    setStaffUsers([]);
    setSelectedId(null);
    selectedIdRef.current = null;
    setConversation(null);
    setMessages([]);
    setReadState([]);
    setSearch("");
    setStatus("ALL");
    syncCursorRef.current = "";
    setLoading(true);
    setError("");
  };

  const startStaffChat = async (staffUserId) => {
    const id = Number(staffUserId);
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const result = await api.startStaffChat(id, token);
      const nextConversation = result.data;
      if (nextConversation) {
        setConversations((current) => {
          const remaining = current.filter((item) => Number(item.id) !== Number(nextConversation.id));
          return [nextConversation, ...remaining];
        });
        setSelectedId(nextConversation.id);
      }
    } catch (requestError) {
      setError(requestError.message || "Could not start the staff conversation.");
    } finally {
      setLoading(false);
    }
  };

  const chatHeader = adminView ? selectedSummary : conversation;
  const activePresence = adminView
    ? chatHeader?.presence || { is_online: false }
    : supportPresence;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={adminView ? (staffMode ? "Staff communication" : "Customer support") : "Private support"}
        title={adminView ? "Messages" : "Chat with Admin"}
        description={
          adminView
            ? staffMode
              ? "Private one-to-one conversations between admins and co-admins."
              : "Read and respond to private customer conversations."
            : "Send a private message to the Nepcha admin team."
        }
        icon="message"
      />

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className={`grid min-h-[620px] ${adminView ? "lg:grid-cols-[340px_minmax(0,1fr)]" : ""}`}>
          {adminView ? (
            <aside className={`${selectedId ? "hidden lg:flex" : "flex"} min-h-0 flex-col border-r border-slate-200 bg-slate-50/70`}>
              <div className="space-y-3 border-b border-slate-200 bg-white p-4">
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => switchChatMode(false)}
                    className={`rounded-lg px-3 py-2 text-xs font-bold ${
                      !staffMode ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    Customers
                  </button>
                  <button
                    type="button"
                    onClick={() => switchChatMode(true)}
                    className={`rounded-lg px-3 py-2 text-xs font-bold ${
                      staffMode ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    Staff
                  </button>
                </div>
                {staffMode ? (
                  <select
                    defaultValue=""
                    onChange={(event) => {
                      startStaffChat(event.target.value);
                      event.target.value = "";
                    }}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                  >
                    <option value="">Start chat with staff…</option>
                    {staffUsers.map((staffUser) => (
                      <option key={staffUser.id} value={staffUser.id}>
                        {staffUser.name} · {staffUser.role} · {staffUser.presence?.is_online ? "Online" : "Offline"}
                      </option>
                    ))}
                  </select>
                ) : null}
                <div className="relative">
                  <Icon name="search" className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={staffMode ? "Search staff name or email…" : "Search customer name or email…"}
                    className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                  />
                </div>
                {!staffMode ? <div className="grid grid-cols-3 gap-2">
                  {["ALL", "OPEN", "CLOSED"].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setStatus(value)}
                      className={`rounded-lg px-2 py-2 text-xs font-semibold ${
                        status === value
                          ? "bg-indigo-600 text-white"
                          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {value === "ALL" ? "All" : value === "OPEN" ? "Open" : "Closed"}
                    </button>
                  ))}
                </div> : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {visibleConversations.length ? (
                  visibleConversations.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`flex w-full items-start gap-3 border-b border-slate-200 p-4 text-left transition ${
                        Number(selectedId) === Number(item.id)
                          ? "bg-indigo-50"
                          : "bg-white hover:bg-slate-50"
                      }`}
                    >
                      <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                        {initials(item.user_name)}
                        <PresenceDot
                          online={item.presence?.is_online}
                          className="absolute bottom-0 right-0"
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-slate-900">{item.user_name}</span>
                          {item.unread_count ? (
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                              {item.unread_count > 99 ? "99+" : item.unread_count}
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-slate-500">{item.user_email}</span>
                        <span className="mt-1 block truncate text-xs text-slate-400">
                          {item.last_message || "No message yet"}
                        </span>
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="p-8 text-center text-sm text-slate-500">
                    {loading ? "Loading conversations…" : "No conversations found."}
                  </div>
                )}
              </div>
            </aside>
          ) : null}

          <div className={`${adminView && !selectedId ? "hidden lg:flex" : "flex"} min-h-0 flex-col bg-slate-100/70`}>
            {adminView && !selectedId ? (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-slate-500">
                {staffMode
                  ? "Select a staff conversation or start a new one."
                  : "Select a customer conversation from the inbox."}
              </div>
            ) : (
              <>
                <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    {adminView ? (
                      <button
                        type="button"
                        onClick={() => setSelectedId(null)}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 lg:hidden"
                        aria-label="Back to conversations"
                      >
                        <span aria-hidden="true">←</span>
                      </button>
                    ) : null}
                    <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                      {adminView ? initials(chatHeader?.user_name) : <Icon name="message" className="h-5 w-5" />}
                      <PresenceDot
                        online={activePresence.is_online}
                        className="absolute bottom-0 right-0"
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {adminView ? chatHeader?.user_name || "Customer" : "Nepcha Admin Team"}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {adminView
                          ? `${staffMode ? "Staff conversation · " : ""}${chatHeader?.user_email || ""}${chatHeader?.country_code ? ` · ${chatHeader.country_code}` : ""}`
                          : "Only you and authorized staff can see this conversation"}
                      </p>
                      <PresenceLabel presence={activePresence} compact />
                    </div>
                  </div>
                  {adminView && conversation && !staffMode ? (
                    <button
                      type="button"
                      onClick={toggleStatus}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                        conversation.status === "OPEN"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {conversation.status === "OPEN" ? "Open · Close" : "Closed · Reopen"}
                    </button>
                  ) : null}
                </header>

                <div className="h-[54vh] min-h-[410px] flex-1 space-y-3 overflow-y-auto p-3 sm:p-5">
                  {loading && !messages.length ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading messages…</div>
                  ) : messages.length ? (
                    messages.map((message) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        currentUserId={user?.id}
                        currentUserRole={role}
                        readState={readState}
                        token={token}
                        staffConversation={staffMode}
                        onMessageUpdated={updateMessage}
                      />
                    ))
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center">
                      <div>
                        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                          <Icon name="message" className="h-6 w-6" />
                        </span>
                        <p className="mt-3 text-sm font-semibold text-slate-800">
                          {adminView ? "No messages in this conversation" : "Start a conversation"}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {adminView
                            ? "The customer has not sent a message yet."
                            : "Ask about an order, product, offer, or account issue."}
                        </p>
                      </div>
                    </div>
                  )}
                  <div ref={messageEndRef} />
                </div>

                <Composer
                  value={draft}
                  onChange={setDraft}
                  onSubmit={submitMessage}
                  sending={sending}
                  disabled={adminView && !selectedId}
                  onAttach={sendAttachment}
                  onReference={() => setReferencePickerOpen(true)}
                  onError={setError}
                />
              </>
            )}
          </div>
        </div>
      </section>
      <ChatReferencePicker
        open={referencePickerOpen}
        token={token}
        conversationId={adminView ? selectedId : undefined}
        staffConversation={adminView && staffMode}
        sending={sending}
        onClose={() => setReferencePickerOpen(false)}
        onSelect={sendReference}
      />
    </div>
  );
}
