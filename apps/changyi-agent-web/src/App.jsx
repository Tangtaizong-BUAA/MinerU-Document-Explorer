import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowDown,
  ArrowUp,
  Check,
  File,
  MagnifyingGlass,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";

const API_ROOT = "/cyj/agent/api";

const statusIcons = {
  brief: Sparkle,
  search: MagnifyingGlass,
  read: File,
  publish: File,
  closeout: Check,
  done: Check,
  error: WarningCircle,
};

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function ArtifactCard({ artifact }) {
  return (
    <a className="artifact-card" href={artifact.downloadUrl} download>
      <span className="artifact-icon" aria-hidden="true"><File size={21} weight="duotone" /></span>
      <span className="artifact-copy">
        <strong>{artifact.filename || artifact.title || "项目文件"}</strong>
        <small>{artifact.mimeType || "项目交付文件"}</small>
      </span>
      <span className="artifact-download" aria-hidden="true"><ArrowDown size={17} /></span>
    </a>
  );
}

function WorkStatus({ status, active }) {
  if (!status) return null;
  const Icon = statusIcons[status.phase] || Sparkle;
  return (
    <div className={`work-status ${active ? "is-active" : ""}`} role="status" aria-live="polite">
      <Icon size={17} weight={active ? "duotone" : "regular"} />
      <span>{status.label}</span>
      {active && <span className="status-dots" aria-hidden="true"><i /><i /><i /></span>}
    </div>
  );
}

function Message({ message }) {
  if (message.role === "user") {
    return <div className="user-row"><div className="user-bubble">{message.text}</div></div>;
  }

  return (
    <article className="agent-turn">
      <WorkStatus status={message.status} active={message.pending} />
      {message.text && (
        <div className="answer-copy">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
        </div>
      )}
      {message.artifacts?.length > 0 && (
        <div className="artifact-list">
          {message.artifacts.map((artifact) => <ArtifactCard key={artifact.id || artifact.downloadUrl} artifact={artifact} />)}
        </div>
      )}
      {message.error && <p className="turn-error">{message.error}</p>}
    </article>
  );
}

function Composer({ value, onChange, onSubmit, disabled, compact }) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, compact ? 144 : 120)}px`;
  }, [value, compact]);

  return (
    <form className={`composer ${compact ? "is-compact" : ""}`} onSubmit={onSubmit}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (!disabled && value.trim()) onSubmit(event);
          }
        }}
        placeholder="给知识库一个任务"
        aria-label="输入要在长翼久安知识库中完成的任务"
        rows={1}
        disabled={disabled}
      />
      <button type="submit" disabled={disabled || !value.trim()} aria-label="发送">
        <ArrowUp size={19} weight="bold" />
      </button>
    </form>
  );
}

export function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(false);
  const [sessionId] = useState(() => localStorage.getItem("cyj-agent-session") || newId());
  const bottomRef = useRef(null);
  const hasConversation = messages.length > 0;

  useEffect(() => {
    localStorage.setItem("cyj-agent-session", sessionId);
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: pending ? "smooth" : "auto", block: "end" });
  }, [messages, pending]);

  async function submit(event) {
    event.preventDefault();
    const text = input.trim();
    if (!text || pending) return;

    const answerId = newId();
    setInput("");
    setPending(true);
    setMessages((current) => [
      ...current,
      { id: newId(), role: "user", text },
      { id: answerId, role: "assistant", text: "", artifacts: [], pending: true, status: { phase: "thinking", label: "正在思考" } },
    ]);

    const updateAnswer = (updater) => {
      setMessages((current) => current.map((message) => message.id === answerId ? updater(message) : message));
    };

    try {
      const response = await fetch(`${API_ROOT}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });
      if (!response.ok || !response.body) {
        throw new Error((await response.text()) || `请求失败 (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const eventData = JSON.parse(line);
          if (eventData.type === "status") {
            updateAnswer((answer) => ({ ...answer, status: eventData }));
          } else if (eventData.type === "delta") {
            updateAnswer((answer) => ({ ...answer, text: answer.text + eventData.text }));
          } else if (eventData.type === "artifact") {
            updateAnswer((answer) => ({ ...answer, artifacts: [...answer.artifacts, eventData.artifact] }));
          } else if (eventData.type === "error") {
            updateAnswer((answer) => ({ ...answer, error: eventData.message, status: { phase: "error", label: "本次工作未完成" } }));
          } else if (eventData.type === "done") {
            updateAnswer((answer) => ({ ...answer, pending: false, status: { phase: "done", label: "已完成本次知识工作" } }));
          }
        }
        if (done) break;
      }
    } catch (error) {
      updateAnswer((answer) => ({ ...answer, pending: false, error: error.message || "连接知识库失败，请稍后重试。", status: { phase: "error", label: "本次工作未完成" } }));
    } finally {
      setPending(false);
      updateAnswer((answer) => ({ ...answer, pending: false }));
    }
  }

  return (
    <main className={hasConversation ? "conversation-shell" : "empty-shell"}>
      {!hasConversation ? (
        <section className="empty-state">
          <h1>我们要在长翼久安知识库中做些什么？</h1>
          <Composer value={input} onChange={setInput} onSubmit={submit} disabled={pending} />
        </section>
      ) : (
        <>
          <section className="conversation" aria-label="知识库问答">
            {messages.map((message) => <Message key={message.id} message={message} />)}
            <div ref={bottomRef} />
          </section>
          <div className="composer-dock">
            <Composer value={input} onChange={setInput} onSubmit={submit} disabled={pending} compact />
          </div>
        </>
      )}
    </main>
  );
}
