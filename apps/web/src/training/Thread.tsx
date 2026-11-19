import type { CommentDto } from "@activen/contracts";
import { useState, type FormEvent } from "react";
import { useI18n } from "../i18n/I18nContext.js";
import { Icon } from "../ui/Icon.js";
import { Empty } from "../ui/States.js";

/** Athlete ↔ coach conversation (newest at the bottom) with a composer and quick replies. */
export function Thread({
  comments,
  myId,
  onSend,
  quickReplies = [],
}: {
  comments: CommentDto[];
  myId: string;
  onSend(body: string): Promise<unknown>;
  quickReplies?: string[];
}) {
  const { t, f } = useI18n();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const send = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    setError(false);
    try {
      await onSend(text.trim());
      setBody("");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(body);
  };
  // Local date via the app formatter (works without browser locale data) plus HH:MM.
  const time = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return `${f.date(local, "dayMonth")} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="stack">
      {comments.length === 0 ? (
        <Empty>{t("coach.threadEmpty")}</Empty>
      ) : (
        <div className="thread" aria-live="polite">
          {comments.map((c) => {
            const mine = c.authorId === myId;
            return (
              <div key={c.id} className={`bubble${mine ? " mine" : ""}`}>
                <div>{c.body}</div>
                <div className="meta">
                  {mine ? t("coach.you") : c.authorName} · {time(c.createdAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {quickReplies.length > 0 && (
        <div className="chips">
          {quickReplies.map((q) => (
            <button
              key={q}
              type="button"
              className="chip chip-button"
              disabled={busy}
              onClick={() => void send(q)}
            >
              {q}
            </button>
          ))}
        </div>
      )}
      <form className="composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="composer">
          {t("coach.write")}
        </label>
        <textarea
          id="composer"
          className="input grow"
          maxLength={4000}
          placeholder={t("coach.write")}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(body);
            }
          }}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !body.trim()}
          aria-label={t("coach.send")}
        >
          <Icon name="send" size={20} />
        </button>
      </form>
      {error && (
        <div className="alert error" role="alert">
          {t("common.error")}
        </div>
      )}
    </div>
  );
}
