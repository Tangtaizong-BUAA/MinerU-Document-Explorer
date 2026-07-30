import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowDown,
  ArrowUp,
  Check,
  File,
  MagnifyingGlass,
  Paperclip,
  Plus,
  Sparkle,
  Stop,
  WarningCircle,
  X,
} from "@phosphor-icons/react";

const API_ROOT = "/cyj/agent/api";
const MODELS = [
  { id: "auto", label: "Auto" },
  { id: "fable-5", label: "Fable 5", detail: "深度推理" },
  { id: "qwen3.8-max", label: "qwen3.8 max", detail: "更强推理" },
  { id: "qwen3.7-flash", label: "qwen3.7-flash", detail: "高速响应" },
];

const statusIcons = { brief: Sparkle, search: MagnifyingGlass, read: File, publish: File, closeout: Check, done: Check, stopped: Stop, error: WarningCircle };
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

function ArtifactCard({ artifact }) {
  return <a className="artifact-card" href={artifact.downloadUrl} download>
    <span className="artifact-icon" aria-hidden="true"><File size={21} weight="duotone" /></span>
    <span className="artifact-copy"><strong>{artifact.filename || artifact.title || "项目文件"}</strong><small>{artifact.mimeType || "项目交付文件"}</small></span>
    <span className="artifact-download" aria-hidden="true"><ArrowDown size={17} /></span>
  </a>;
}

function WorkStatus({ status, active }) {
  if (!status) return null;
  const Icon = statusIcons[status.phase] || Sparkle;
  return <div className={`work-status ${active ? "is-active" : ""}`} role="status" aria-live="polite">
    <Icon size={17} weight={active ? "duotone" : "regular"} /><span>{status.label}</span>
    {active && <span className="status-dots" aria-hidden="true"><i /><i /><i /></span>}
  </div>;
}

function Message({ message, questionRef, active }) {
  if (message.role === "user") return <div className={`user-row ${active ? "is-active-question" : ""}`} ref={active ? questionRef : undefined}><div className="user-bubble">{message.text}</div></div>;
  return <article className={`agent-turn ${message.pending ? "is-active" : ""}`}>
    <WorkStatus status={message.status} active={message.pending} />
    {message.text && <div className="answer-copy"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown></div>}
    {message.artifacts?.length > 0 && <div className="artifact-list">{message.artifacts.map((artifact) => <ArtifactCard key={artifact.id || artifact.downloadUrl} artifact={artifact} />)}</div>}
    {message.error && <p className="turn-error">{message.error}</p>}
  </article>;
}

function Composer({ value, onChange, onSubmit, pending, onStop, compact, model, onModel, attachments, onFiles, onRemoveAttachment }) {
  const textareaRef = useRef(null);
  const fileRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);

  function openMenu() {
    setMenuMounted(true);
    requestAnimationFrame(() => setOpen(true));
  }

  function closeMenu() {
    setOpen(false);
  }

  function toggleMenu() {
    if (open || menuMounted) closeMenu();
    else openMenu();
  }

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, compact ? 150 : 126)}px`;
  }, [value, compact]);

  useEffect(() => {
    const close = (event) => { if (open && !menuRef.current?.contains(event.target)) closeMenu(); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return <form className={`composer ${compact ? "is-compact" : ""} ${attachments.length ? "has-attachments" : ""}`} onSubmit={onSubmit}>
    {attachments.length > 0 && <div className="attachment-strip">
      {attachments.map((item) => <span className={`attachment-chip ${item.pending ? "is-uploading" : ""}`} key={item.localId}>
        <Paperclip size={14} /><span>{item.name}</span>{item.pending && <i />}
        {!item.pending && <button type="button" onClick={() => onRemoveAttachment(item.localId)} aria-label={`移除 ${item.name}`}><X size={13} /></button>}
      </span>)}
    </div>}
    <div className="composer-row">
      <div className="composer-tools" ref={menuRef}>
        <button className="plus-button" type="button" onClick={toggleMenu} aria-expanded={open} aria-label="添加文件或选择模型"><Plus size={19} weight="regular" /></button>
        <input ref={fileRef} className="file-input" type="file" multiple onChange={(event) => { onFiles([...event.target.files]); event.target.value = ""; closeMenu(); }} />
        {menuMounted && <div className={`composer-menu ${open ? "is-open" : "is-closing"}`} onAnimationEnd={() => { if (!open) setMenuMounted(false); }}>
          <button className="upload-row" type="button" onClick={() => fileRef.current?.click()}><Paperclip size={18} /><span><strong>上传文件</strong><small>图片、PDF、Office、文本</small></span></button>
          <div className="menu-divider" />
          {MODELS.map((item) => <button className={`model-row ${model === item.id ? "is-selected" : ""}`} type="button" key={item.id} onClick={() => { onModel(item.id); closeMenu(); }}>
            <strong>{item.label}</strong>{item.detail && <span className="model-detail">{item.detail}</span>}{model === item.id && <Check className="model-check" size={15} weight="bold" />}
          </button>)}
        </div>}
      </div>
      <textarea ref={textareaRef} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (!pending && (value.trim() || attachments.length)) onSubmit(event); }
      }} placeholder="给知识库一个任务" aria-label="输入要在长翼久安知识库中完成的任务" rows={1} />
      {pending ? <button className="send-button stop-button" type="button" onClick={onStop} aria-label="终止工作"><Stop size={17} weight="fill" /></button>
        : <button className="send-button" type="submit" disabled={!value.trim() && !attachments.length} aria-label="发送"><ArrowUp size={17} weight="bold" /></button>}
    </div>
  </form>;
}

export function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(false);
  const [model, setModel] = useState(() => localStorage.getItem("cyj-agent-model") || "auto");
  const [attachments, setAttachments] = useState([]);
  const [sessionId] = useState(() => localStorage.getItem("cyj-agent-session") || newId());
  const activeQuestionRef = useRef(null);
  const requestController = useRef(null);
  const viewTransitionRef = useRef(null);
  const [activeQuestionId, setActiveQuestionId] = useState(null);
  const hasConversation = messages.length > 0;

  useEffect(() => { localStorage.setItem("cyj-agent-session", sessionId); }, [sessionId]);
  useEffect(() => { localStorage.setItem("cyj-agent-model", model); }, [model]);
  useLayoutEffect(() => {
    if (!activeQuestionId || !activeQuestionRef.current) return;
    let frame;
    let cancelled = false;
    const anchor = () => {
      if (cancelled) return;
      frame = requestAnimationFrame(() => activeQuestionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    const transition = viewTransitionRef.current;
    if (transition) transition.finished.then(anchor, anchor);
    else anchor();
    return () => { cancelled = true; if (frame) cancelAnimationFrame(frame); };
  }, [activeQuestionId]);

  async function addFiles(files) {
    const accepted = files.slice(0, Math.max(0, 6 - attachments.length));
    for (const file of accepted) {
      const localId = newId();
      setAttachments((current) => [...current, { localId, name: file.name, size: file.size, type: file.type, pending: true }]);
      try {
        const response = await fetch(`${API_ROOT}/uploads`, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name), "X-Session-Id": sessionId }, body: file });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "上传失败");
        setAttachments((current) => current.map((item) => item.localId === localId ? { ...item, ...payload.attachment, pending: false } : item));
      } catch (error) {
        setAttachments((current) => current.filter((item) => item.localId !== localId));
        setMessages((current) => [...current, { id: newId(), role: "assistant", error: `${file.name}：${error.message}`, pending: false, status: { phase: "error", label: "文件未能上传" } }]);
      }
    }
  }

  function stop() { requestController.current?.abort(); }

  async function submit(event) {
    event.preventDefault();
    const text = input.trim();
    const readyAttachments = attachments.filter((item) => !item.pending && item.artifactId);
    if ((!text && !readyAttachments.length) || pending || attachments.some((item) => item.pending)) return;
    const answerId = newId();
    const questionId = newId();
    const controller = new AbortController();
    requestController.current = controller;
    const displayText = text || "请阅读并整理这些文件";
    const commitTurn = () => flushSync(() => {
      setInput(""); setAttachments([]); setPending(true);
      setMessages((current) => [...current, { id: questionId, role: "user", text: displayText }, { id: answerId, role: "assistant", text: "", artifacts: [], pending: true, status: { phase: "thinking", label: "正在思考" } }]);
      setActiveQuestionId(questionId);
    });
    if (!hasConversation && document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const transition = document.startViewTransition(commitTurn);
      viewTransitionRef.current = transition;
      transition.finished.finally(() => { if (viewTransitionRef.current === transition) viewTransitionRef.current = null; });
    } else commitTurn();
    const updateAnswer = (updater) => setMessages((current) => current.map((message) => message.id === answerId ? updater(message) : message));
    try {
      const response = await fetch(`${API_ROOT}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ sessionId, message: displayText, model, attachments: readyAttachments.map(({ artifactId, name, mimeType }) => ({ artifactId, name, mimeType })) }) });
      if (!response.ok || !response.body) throw new Error((await response.text()) || `请求失败 (${response.status})`);
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read(); buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n"); buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const data = JSON.parse(line);
          if (data.type === "status") updateAnswer((answer) => ({ ...answer, status: data }));
          else if (data.type === "delta") updateAnswer((answer) => ({ ...answer, text: answer.text + data.text }));
          else if (data.type === "artifact") updateAnswer((answer) => ({ ...answer, artifacts: [...answer.artifacts, data.artifact] }));
          else if (data.type === "error") updateAnswer((answer) => ({ ...answer, error: data.message, status: { phase: "error", label: "本次工作未完成" } }));
          else if (data.type === "done") updateAnswer((answer) => ({ ...answer, pending: false, status: { phase: "done", label: "已完成本次知识工作" } }));
        }
        if (done) break;
      }
    } catch (error) {
      if (error.name === "AbortError") updateAnswer((answer) => ({ ...answer, pending: false, status: { phase: "stopped", label: "已终止本次工作" } }));
      else updateAnswer((answer) => ({ ...answer, pending: false, error: error.message || "连接知识库失败，请稍后重试。", status: { phase: "error", label: "本次工作未完成" } }));
    } finally { requestController.current = null; setPending(false); updateAnswer((answer) => ({ ...answer, pending: false })); }
  }

  const composerProps = { value: input, onChange: setInput, onSubmit: submit, pending, onStop: stop, model, onModel: setModel, attachments, onFiles: addFiles, onRemoveAttachment: (id) => setAttachments((current) => current.filter((item) => item.localId !== id)) };
  return <main className={hasConversation ? "conversation-shell" : "empty-shell"}>
    {!hasConversation ? <section className="empty-state"><h1>在长翼久安知识库中做些什么？</h1><Composer {...composerProps} /></section>
      : <><section className="conversation" aria-label="知识库问答">{messages.map((message) => <Message key={message.id} message={message} active={message.id === activeQuestionId} questionRef={activeQuestionRef} />)}</section><div className="composer-dock"><Composer {...composerProps} compact /></div></>}
  </main>;
}
