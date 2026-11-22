import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { askFireWatchAI, type ChatTurn } from "@/lib/ai.functions";
import { useFieldData, resourceLabel } from "@/lib/field-data";
import { assessRisk, evaluateAlerts } from "@/lib/sensors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Message extends ChatTurn {
  notice?: string;
}

/** Floating "Ask FireWatch AI" helper (Luke), available on every page. */
export function FireWatchAI() {
  const { sensors, resources } = useFieldData();
  const ask = useServerFn(askFireWatchAI);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! Ask me about your sensors, alerts, or wildfire-prevention readings.",
    },
  ]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  // Sign-in screens stay clean.
  if (pathname === "/auth" || pathname === "/reset-password") return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    const history = messages.slice(1).map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: question }]);
    setInput("");
    setBusy(true);
    try {
      const result = await ask({
        data: {
          message: question,
          history,
          openAlerts: evaluateAlerts(sensors).length,
          availableResources: resources
            .filter((r) => r.status === "Available")
            .map((r) => `${resourceLabel(r.type)} ${r.id}`),
          sensors: sensors.map((s) => {
            const risk = assessRisk(s);
            return {
              id: s.id,
              name: s.name,
              zone: s.zone,
              temperatureF: s.temperatureF,
              humidityPct: s.humidityPct,
              trendFPerHr: s.tempTrendFPerHr,
              risk: risk.score,
              riskLabel: risk.label,
              online: s.online,
              live: s.source === "live",
            };
          }),
        },
      });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: result.reply,
          ...(result.notice ? { notice: result.notice } : {}),
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "I could not connect to FireWatch AI." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-5 bottom-5 z-50 rounded-full px-5 shadow-[var(--shadow-ember)]"
        >
          <Sparkles className="size-4" aria-hidden />
          Ask FireWatch AI
        </Button>
      )}
      {open && (
        <section
          aria-label="FireWatch AI chat"
          className="panel fixed right-5 bottom-5 z-50 flex h-[min(520px,80vh)] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden"
        >
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="label-eyebrow">Live sensor helper</p>
              <h2 className="text-lg">FireWatch AI</h2>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              <X className="size-4" />
            </Button>
          </header>
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex"}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-surface-raised"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.notice && <p className="mt-1 text-xs text-muted-foreground">{m.notice}</p>}
                </div>
              </div>
            ))}
            {busy && <p className="text-xs text-muted-foreground">Thinking…</p>}
          </div>
          <form onSubmit={submit} className="flex gap-2 border-t border-border p-3">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={1500}
              placeholder="Ask about your sensors…"
              aria-label="Your question"
              autoComplete="off"
            />
            <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
              <Send className="size-4" />
            </Button>
          </form>
        </section>
      )}
    </>
  );
}
