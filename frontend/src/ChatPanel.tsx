import { useEffect, useRef, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Paperclip, Send, Trash2, User, X } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { postForm, postJSON } from "./api";

export type AgentChart = {
  type: "bar" | "line";
  title: string;
  x: string;
  series: string[];
  data: Record<string, string | number>[];
};

type Message = { role: "user" | "assistant"; content: string; chart?: AgentChart | null; file?: string };
type AgentReply = { reply: string; chart: AgentChart | null };

const COLORS = ["#E76F6F", "#007AFF", "#10B981", "#F59E0B"];
const MAX_FILE_MB = 8;
const ACCEPT = ".xlsx,.csv,.docx,.png,.jpg,.jpeg,.webp";
const MAX_QUESTION = 1000;

function ChartView({ chart }: { chart: AgentChart }) {
  const Chart = chart.type === "line" ? LineChart : BarChart;
  return (
    <div className="mt-3 rounded-xl border border-gray-100 bg-white p-3">
      {chart.title && <p className="mb-2 text-xs font-semibold text-gray-600">{chart.title}</p>}
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <Chart data={chart.data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
            <XAxis dataKey={chart.x} tick={{ fontSize: 10 }} minTickGap={10} />
            <YAxis tick={{ fontSize: 11 }} width={55} />
            <Tooltip />
            <Legend />
            {chart.series.map((name, i) =>
              chart.type === "line"
                ? <Line key={name} type="monotone" dataKey={name} stroke={COLORS[i % 4]} strokeWidth={2} dot={false} />
                : <Bar key={name} dataKey={name} fill={COLORS[i % 4]} radius={[4, 4, 0, 0]} />,
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Markdown({ text }: { text: string }) {
  // react-markdown n'interprète pas le HTML brut et neutralise les liens javascript: (pas de XSS).
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="my-1.5">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
        ul: ({ children }) => <ul className="my-1.5 list-disc pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="my-1.5 list-decimal pl-5">{children}</ol>,
        a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-blue-600 underline">{children}</a>,
        table: ({ children }) => <div className="my-2 overflow-x-auto"><table className="border-collapse text-xs">{children}</table></div>,
        th: ({ children }) => <th className="border border-gray-300 bg-gray-100 px-2 py-1 text-left">{children}</th>,
        td: ({ children }) => <td className="border border-gray-300 px-2 py-1">{children}</td>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

export default function ChatPanel({
  endpoint, extraBody, suggestions, placeholder, allowFiles = false, intro,
}: {
  endpoint: "chat" | "advice";
  extraBody?: Record<string, unknown>;
  suggestions: string[];
  placeholder: string;
  allowFiles?: boolean;
  intro?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, loading]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const pickFile = (picked: File | undefined) => {
    setError("");
    if (!picked) return;
    if (picked.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`Fichier trop volumineux (max ${MAX_FILE_MB} Mo).`);
      return;
    }
    setFile(picked);
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setError("");
    setLoading(true);
    const history = messages.slice(-10).map(({ role, content }) => ({ role, content: content.slice(0, 4000) }));
    setMessages((current) => [...current, { role: "user", content: q, file: file?.name }]);
    setQuestion("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      let data: AgentReply;
      if (file) {
        const form = new FormData();
        form.append("question", q);
        form.append("history", JSON.stringify(history));
        form.append("file", file);
        data = await postForm<AgentReply>("/api/agent/chat-file", form, controller.signal);
      } else {
        data = await postJSON<AgentReply>(`/api/agent/${endpoint}`, { question: q, history, ...extraBody }, controller.signal);
      }
      setMessages((current) => [...current, { role: "assistant", content: data.reply, chart: data.chart }]);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
      setMessages((current) => current.slice(0, -1));
      setQuestion(q);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const onSubmit = (event: FormEvent) => { event.preventDefault(); void send(question); };

  return (
    <div className="flex flex-col">
      <div className="max-h-[560px] min-h-[220px] space-y-4 overflow-y-auto rounded-2xl bg-gray-50 p-4">
        {messages.length === 0 && (
          <div className="py-4 text-center">
            {intro && <p className="mb-4 text-sm text-gray-500">{intro}</p>}
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => void send(s)} disabled={loading}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:border-blue-300 hover:text-blue-700">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && <div className="mt-1 h-7 w-7 shrink-0 rounded-full bg-blue-600 p-1.5 text-white"><Bot size={16} /></div>}
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-blue-600 text-white" : "border border-gray-100 bg-white text-gray-700"}`}>
              {m.role === "user" ? (
                <>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.file && <p className="mt-1 text-xs text-blue-100">📎 {m.file}</p>}
                </>
              ) : (
                <>
                  <Markdown text={m.content} />
                  {m.chart && <ChartView chart={m.chart} />}
                </>
              )}
            </div>
            {m.role === "user" && <div className="mt-1 h-7 w-7 shrink-0 rounded-full bg-gray-200 p-1.5 text-gray-600"><User size={16} /></div>}
          </div>
        ))}
        {loading && <p className="pl-10 text-sm text-gray-400">Analyse en cours…</p>}
        <div ref={endRef} />
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}

      <form onSubmit={onSubmit} className="mt-3 flex flex-wrap items-center gap-2">
        {allowFiles && (
          <>
            <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
            <button type="button" onClick={() => fileRef.current?.click()} title="Joindre un fichier (Excel, CSV, Word, photo de facture)"
              className="rounded-xl border border-gray-200 bg-white p-3 text-gray-500 hover:text-blue-600">
              <Paperclip size={16} />
            </button>
          </>
        )}
        <input
          className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500"
          placeholder={placeholder} value={question} maxLength={MAX_QUESTION}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" disabled={loading || !question.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          <Send size={15} /> Envoyer
        </button>
        {messages.length > 0 && (
          <button type="button" onClick={() => { abortRef.current?.abort(); setMessages([]); setLoading(false); }} title="Nouvelle conversation"
            className="rounded-xl border border-gray-200 bg-white p-3 text-gray-500 hover:text-rose-600">
            <Trash2 size={16} />
          </button>
        )}
      </form>
      {file && (
        <p className="mt-2 inline-flex items-center gap-2 text-xs text-gray-500">
          📎 {file.name} — sera analysé avec ta prochaine question
          <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} aria-label="Retirer le fichier"><X size={13} /></button>
        </p>
      )}
    </div>
  );
}
