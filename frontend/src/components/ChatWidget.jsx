import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { normalizeRole } from "../utils/roles";
import Icon from "./Icon";
import { ChatMessageContent, ChatReferencePicker } from "./ChatMessageExtras";
import { PresenceDot, PresenceLabel } from "./ChatPresence";
import VoiceMessageRecorder from "./VoiceMessageRecorder";

const ADMIN_ROLES = new Set(["ADMIN", "CO_ADMIN"]);
const MESSAGE_POLL_MS = 5000;
const INBOX_POLL_MS = 10000;

const customerPrompts = [
  { label: "Order status", text: "Hello, I need help checking my order status. Order number: " },
  { label: "Product stock", text: "Hello, I want to ask about the availability of: " },
  { label: "Offer help", text: "Hello, I need help with an offer product: " },
  { label: "Account help", text: "Hello, I need help with my account." },
];

const adminReplies = [
  { label: "We’re checking", text: "We are checking this for you and will update you shortly." },
  { label: "Order number?", text: "Please share your order number so we can check it." },
  { label: "Product details?", text: "Please share the product article and colour." },
  { label: "Resolved?", text: "Has this issue been resolved, or do you still need help?" },
];

const mergeMessages = (current, incoming) => {
  const messages = new Map(current.map((item) => [Number(item.id), item]));
  incoming.forEach((item) => messages.set(Number(item.id), item));
  return [...messages.values()].sort((a, b) => Number(a.id) - Number(b.id));
};

const initials = (name) =>
  String(name || "User")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

const formatMessageTime = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function CompactMessage({ message, currentUserId, currentUserRole, readState, token, staffConversation = false, onMessageUpdated }) {
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
        className={`max-w-[84%] rounded-2xl px-3 py-2 shadow-sm ${
          mine
            ? "rounded-br-md bg-indigo-600 text-white"
            : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
        }`}
      >
        <p className={`text-[10px] font-semibold ${mine ? "text-indigo-100" : "text-indigo-700"}`}>
          {mine ? "You" : message.sender_name}
        </p>
        <ChatMessageContent
          message={message}
          token={token}
          mine={mine}
          compact
          onUpdated={onMessageUpdated}
        />
        <div className={`mt-1 flex items-center gap-2 text-[9px] ${mine ? "text-indigo-200" : "text-slate-400"}`}>
          <span>{formatMessageTime(message.created_at)}</span>
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

export default function ChatWidget({ user, token, unreadCount = 0 }) {
  const role = normalizeRole(user?.role);
  const adminView = ADMIN_ROLES.has(role);
  const [open, setOpen] = useState(false);
  const [staffMode, setStaffMode] = useState(false);
  const [showInbox, setShowInbox] = useState(adminView);
  const [choosingUser, setChoosingUser] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [chatUsers, setChatUsers] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [supportPresence, setSupportPresence] = useState({ is_online: false });
  const [messages, setMessages] = useState([]);
  const [readState, setReadState] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const latestMessageIdRef = useRef(0);
  const syncCursorRef = useRef("");
  const selectedIdRef = useRef(null);
  const requestRef = useRef(false);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    latestMessageIdRef.current = messages.length
      ? Number(messages[messages.length - 1].id)
      : 0;
  }, [messages]);

  useEffect(() => {
    setShowInbox(adminView);
    setStaffMode(false);
    setChoosingUser(false);
    setSelectedId(null);
    setConversation(null);
    setSupportPresence({ is_online: false });
    setMessages([]);
    setReadState([]);
    syncCursorRef.current = "";
  }, [adminView, user?.id]);

  const announceUnreadChange = useCallback(() => {
    window.dispatchEvent(new Event("nepcha:chat-unread-changed"));
  }, []);

  const updateMessage = useCallback((updatedMessage) => {
    setMessages((current) => mergeMessages(current, [updatedMessage]));
  }, []);

  const loadInbox = useCallback(async () => {
    if (!adminView || requestRef.current) return;
    requestRef.current = true;
    try {
      const result = staffMode
        ? await api.getStaffChatConversations(token)
        : await api.getChatConversations(token, { status: "ALL" });
      setConversations(result.data || []);
      setError("");
    } catch (requestError) {
      setError(requestError.message || "Could not load messages.");
    } finally {
      requestRef.current = false;
      setLoading(false);
    }
  }, [adminView, staffMode, token]);

  const loadChatUsers = useCallback(async () => {
    if (!adminView || requestRef.current) return;
    requestRef.current = true;
    try {
      const result = staffMode
        ? await api.getStaffChatUsers(token)
        : await api.getChatUsers(token);
      setChatUsers(result.data || []);
      setError("");
    } catch (requestError) {
      setError(requestError.message || "Could not load users.");
    } finally {
      requestRef.current = false;
      setLoading(false);
    }
  }, [adminView, staffMode, token]);

  const loadCustomerMessages = useCallback(
    async (incremental = false) => {
      if (requestRef.current) return;
      requestRef.current = true;
      try {
        const result = await api.getMyChat(
          token,
          incremental ? latestMessageIdRef.current : undefined,
          incremental ? syncCursorRef.current : undefined
        );
        const nextConversation = result.data?.conversation || null;
        const nextMessages = result.data?.messages || [];
        setReadState(result.data?.read_state || []);
        syncCursorRef.current = result.data?.sync_cursor || syncCursorRef.current;
        setSupportPresence(result.data?.support_presence || { is_online: false });
        setConversation(nextConversation);
        setMessages((current) =>
          incremental ? mergeMessages(current, nextMessages) : nextMessages
        );
        if (nextConversation && (nextMessages.length || !incremental)) {
          await api.markMyChatRead(token);
          announceUnreadChange();
        }
        setError("");
      } catch (requestError) {
        setError(requestError.message || "Could not load chat.");
      } finally {
        requestRef.current = false;
        setLoading(false);
      }
    },
    [announceUnreadChange, token]
  );

  const loadAdminMessages = useCallback(
    async (conversationId, incremental = false) => {
      if (!conversationId || requestRef.current) return;
      requestRef.current = true;
      try {
        const result = staffMode
          ? await api.getStaffChatConversation(
              conversationId,
              token,
              incremental ? latestMessageIdRef.current : undefined,
              incremental ? syncCursorRef.current : undefined
            )
          : await api.getChatConversation(
              conversationId,
              token,
              incremental ? latestMessageIdRef.current : undefined,
              incremental ? syncCursorRef.current : undefined
            );
        if (Number(selectedIdRef.current) !== Number(conversationId)) return;
        const nextMessages = result.data?.messages || [];
        syncCursorRef.current = result.data?.sync_cursor || syncCursorRef.current;
        setReadState(result.data?.read_state || []);
        setConversation(result.data?.conversation || null);
        setMessages((current) =>
          incremental ? mergeMessages(current, nextMessages) : nextMessages
        );
        if (nextMessages.length || !incremental) {
          if (staffMode) await api.markStaffChatRead(conversationId, token);
          else await api.markAdminChatRead(conversationId, token);
          setConversations((current) =>
            current.map((item) =>
              Number(item.id) === Number(conversationId)
                ? { ...item, unread_count: 0 }
                : item
            )
          );
          announceUnreadChange();
        }
        setError("");
      } catch (requestError) {
        setError(requestError.message || "Could not load this conversation.");
      } finally {
        requestRef.current = false;
        setLoading(false);
      }
    },
    [announceUnreadChange, staffMode, token]
  );

  useEffect(() => {
    if (!open) return undefined;
    setLoading(true);
    if (adminView) {
      if (choosingUser) loadChatUsers();
      else if (showInbox) loadInbox();
      else if (selectedId) loadAdminMessages(selectedId, false);
    } else {
      loadCustomerMessages(false);
    }
    return undefined;
  }, [adminView, choosingUser, loadAdminMessages, loadChatUsers, loadCustomerMessages, loadInbox, open, selectedId, showInbox]);

  useEffect(() => {
    if (!open) return undefined;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (adminView) {
        if (choosingUser) return;
        if (showInbox) loadInbox();
        else if (selectedIdRef.current) loadAdminMessages(selectedIdRef.current, true);
      } else {
        loadCustomerMessages(true);
      }
    }, adminView && showInbox ? INBOX_POLL_MS : MESSAGE_POLL_MS);
    return () => window.clearInterval(interval);
  }, [adminView, choosingUser, loadAdminMessages, loadCustomerMessages, loadInbox, open, showInbox]);

  useEffect(() => {
    if (open && !showInbox) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages.length, open, showInbox]);

  const chooseConversation = (item) => {
    setSelectedId(item.id);
    selectedIdRef.current = item.id;
    setConversation(item);
    setMessages([]);
    setReadState([]);
    setChoosingUser(false);
    latestMessageIdRef.current = 0;
    syncCursorRef.current = "";
    setShowInbox(false);
  };

  const chooseInboxMode = (nextStaffMode) => {
    setStaffMode(nextStaffMode);
    setShowInbox(true);
    setChoosingUser(false);
    setUserSearch("");
    setConversations([]);
    setChatUsers([]);
    setSelectedId(null);
    selectedIdRef.current = null;
    setConversation(null);
    setMessages([]);
    setReadState([]);
    latestMessageIdRef.current = 0;
    syncCursorRef.current = "";
    setLoading(true);
    setError("");
  };

  const chooseQuickText = (text) => {
    setDraft(text);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const startChatWithUser = async (chatUser) => {
    if (startingChat) return;
    setStartingChat(true);
    setError("");
    try {
      const result = staffMode
        ? await api.startStaffChat(chatUser.id, token)
        : await api.startAdminChat(chatUser.id, token);
      const nextConversation = result.data;
      if (nextConversation) {
        setConversations((current) => {
          const remaining = current.filter(
            (item) => Number(item.id) !== Number(nextConversation.id)
          );
          return [nextConversation, ...remaining];
        });
        chooseConversation(nextConversation);
      }
    } catch (requestError) {
      setError(requestError.message || "Could not start this chat.");
    } finally {
      setStartingChat(false);
    }
  };

  const sendMessage = async (event) => {
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
      if (result.data) setMessages((current) => mergeMessages(current, [result.data]));
      setDraft("");
      if (!adminView && !conversation) await loadCustomerMessages(false);
      announceUnreadChange();
    } catch (requestError) {
      setError(requestError.message || "Could not send this message.");
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
      if (!adminView && !conversation) await loadCustomerMessages(false);
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
      if (!adminView && !conversation) await loadCustomerMessages(false);
      announceUnreadChange();
    } catch (requestError) {
      setError(requestError.message || "Could not upload this attachment.");
    } finally {
      setSending(false);
    }
  };

  const quickOptions = adminView ? adminReplies : customerPrompts;
  const filteredChatUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    if (!term) return chatUsers;
    return chatUsers.filter((item) =>
      `${item.name} ${item.email} ${item.role}`.toLowerCase().includes(term)
    );
  }, [chatUsers, userSearch]);
  const headerTitle = useMemo(() => {
    if (!adminView) return "Chat with Admin";
    if (choosingUser) return staffMode ? "Start staff chat" : "Start customer chat";
    if (showInbox) return staffMode ? "Staff Conversations" : "Customer Messages";
    return conversation?.user_name || "Conversation";
  }, [adminView, choosingUser, conversation?.user_name, showInbox, staffMode]);
  const activePresence = adminView
    ? conversation?.presence || { is_online: false }
    : supportPresence;

  return (
    <div className="fixed bottom-4 right-3 z-[80] sm:right-4">
      {open ? (
        <section className="absolute bottom-16 right-0 flex h-[min(620px,calc(100vh-7rem))] w-[calc(100vw-1.5rem)] max-w-[400px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <header className="flex items-center justify-between gap-3 bg-indigo-600 px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-2.5">
              {adminView && (!showInbox || choosingUser) ? (
                <button
                  type="button"
                  onClick={() => {
                    if (choosingUser) {
                      setChoosingUser(false);
                      setUserSearch("");
                    }
                    setShowInbox(true);
                    setSelectedId(null);
                    setMessages([]);
                    setReadState([]);
                  }}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20"
                  aria-label="Back to inbox"
                >
                  <span aria-hidden="true">←</span>
                </button>
              ) : (
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <Icon name="message" className="h-5 w-5" />
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{headerTitle}</p>
                {adminView && showInbox ? (
                  <p className="truncate text-[10px] text-indigo-100">
                    {staffMode ? "Private staff conversations" : "Private support inbox"}
                  </p>
                ) : (
                  <PresenceLabel presence={activePresence} compact light />
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {adminView && showInbox && !choosingUser ? (
                <button
                  type="button"
                  onClick={() => {
                    setChoosingUser(true);
                    setLoading(true);
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white hover:bg-white/15"
                  aria-label="Start new chat"
                  title="Start new chat"
                >
                  <Icon name="plus" className="h-4 w-4" />
                </button>
              ) : null}
              <Link
                to="/chat"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white hover:bg-white/15"
                aria-label="Open full chat page"
                title="Open full chat page"
              >
                <Icon name="maximize" className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white hover:bg-white/15"
                aria-label="Close chat"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
          </header>

          {error ? (
            <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          ) : null}

          {adminView && choosingUser ? (
            <div className="min-h-0 flex-1 overflow-hidden bg-slate-50">
              <div className="border-b border-slate-200 bg-white p-3">
                <div className="relative">
                  <Icon name="search" className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder={staffMode ? "Search staff name or email…" : "Search user name or email…"}
                    className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                    autoFocus
                  />
                </div>
              </div>
              <div className="h-full overflow-y-auto pb-20">
                {loading && !chatUsers.length ? (
                  <div className="p-8 text-center text-xs text-slate-500">Loading users…</div>
                ) : filteredChatUsers.length ? (
                  filteredChatUsers.map((chatUser) => (
                    <button
                      key={chatUser.id}
                      type="button"
                      disabled={startingChat}
                      onClick={() => startChatWithUser(chatUser)}
                      className="flex w-full items-center gap-3 border-b border-slate-200 bg-white p-3 text-left hover:bg-indigo-50 disabled:opacity-60"
                    >
                      <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                        {initials(chatUser.name)}
                        <PresenceDot
                          online={chatUser.presence?.is_online}
                          className="absolute bottom-0 right-0"
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-slate-900">{chatUser.name}</span>
                        <span className="block truncate text-[10px] text-slate-500">{chatUser.email}</span>
                        <span className="mt-0.5 block text-[9px] font-semibold uppercase text-slate-400">
                          {chatUser.role} · {chatUser.conversation_id ? "Existing chat" : "New chat"}
                        </span>
                      </span>
                      <span className="text-xs font-bold text-indigo-600">Chat</span>
                    </button>
                  ))
                ) : (
                  <div className="p-8 text-center text-xs text-slate-500">No matching users.</div>
                )}
              </div>
            </div>
          ) : adminView && showInbox ? (
            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50">
              <div className="sticky top-0 z-10 border-b border-slate-200 bg-white p-3">
                <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => chooseInboxMode(false)}
                    className={`rounded-lg px-2 py-2 text-[10px] font-bold ${
                      !staffMode ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    Customer chats
                  </button>
                  <button
                    type="button"
                    onClick={() => chooseInboxMode(true)}
                    className={`rounded-lg px-2 py-2 text-[10px] font-bold ${
                      staffMode ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    Staff chats
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setChoosingUser(true);
                    setLoading(true);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-50 px-3 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                >
                  <Icon name="plus" className="h-4 w-4" />
                  {staffMode ? "Start staff chat" : "Start customer chat"}
                </button>
              </div>
              {loading && !conversations.length ? (
                <div className="p-8 text-center text-xs text-slate-500">Loading messages…</div>
              ) : conversations.length ? (
                conversations.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => chooseConversation(item)}
                    className="flex w-full items-start gap-3 border-b border-slate-200 bg-white p-3 text-left hover:bg-indigo-50"
                  >
                    <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                      {initials(item.user_name)}
                      <PresenceDot
                        online={item.presence?.is_online}
                        className="absolute bottom-0 right-0"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-semibold text-slate-900">{item.user_name}</span>
                        {item.unread_count ? (
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
                            {item.unread_count > 99 ? "99+" : item.unread_count}
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-[10px] text-slate-500">{item.user_email}</span>
                      <span className="mt-1 block truncate text-[11px] text-slate-400">{item.last_message || "No message"}</span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="p-8 text-center text-xs text-slate-500">
                  {staffMode ? "No staff conversations yet." : "No customer conversations yet."}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-slate-100/80 p-3">
                {loading && !messages.length ? (
                  <div className="flex h-full items-center justify-center text-xs text-slate-500">Loading chat…</div>
                ) : messages.length ? (
                  messages.map((message) => (
                    <CompactMessage
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
                  <div className="flex h-full items-center justify-center px-8 text-center">
                    <div>
                      <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                        <Icon name="message" className="h-5 w-5" />
                      </span>
                      <p className="mt-2 text-xs font-semibold text-slate-800">
                        {adminView ? "No messages yet" : "How can we help?"}
                      </p>
                      <p className="mt-1 text-[10px] leading-4 text-slate-500">
                        {adminView
                          ? "Reply below to start this conversation."
                          : "Choose a quick topic or write your message."}
                      </p>
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              <div className="border-t border-slate-200 bg-white px-3 pt-2.5">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {adminView ? "Quick replies" : "Quick chat"}
                </p>
                <div className="flex gap-1.5 overflow-x-auto pb-2">
                  {quickOptions.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => chooseQuickText(option.text)}
                      className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={sendMessage} className="border-t border-slate-100 bg-white p-3">
                <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5 focus-within:border-indigo-300">
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => setReferencePickerOpen(true)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-indigo-600 hover:bg-indigo-100 disabled:opacity-40"
                    title="Share product or order"
                    aria-label="Share product or order"
                  >
                    <Icon name="ledger" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-indigo-600 hover:bg-indigo-100 disabled:opacity-40"
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
                      if (file) sendAttachment(file);
                    }}
                  />
                  <VoiceMessageRecorder
                    compact
                    disabled={sending || (adminView && !selectedId)}
                    onSend={sendAttachment}
                    onError={setError}
                  />
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey && draft.trim()) {
                        event.preventDefault();
                        sendMessage(event);
                      }
                    }}
                    rows={1}
                    maxLength={4000}
                    placeholder="Type your message…"
                    className="max-h-24 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-xs outline-none"
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {sending ? "…" : "Send"}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xl ring-4 ring-white transition hover:-translate-y-0.5 hover:bg-indigo-700"
        aria-label={open ? "Close chat" : "Open chat"}
        title={open ? "Close chat" : "Open chat"}
      >
        <Icon name={open ? "close" : "message"} className="h-6 w-6" />
        {!open && unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>
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
