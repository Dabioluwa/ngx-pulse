"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Zap } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

const EXAMPLE_QUERIES = [
  "Is GTCO bullish?",
  "Price of MTNN",
  "Show me RSI for ZENITHBANK",
  "DANGCEM setup badge",
  "SEPLAT trend",
  "List all stocks",
];

export default function QueryPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  async function handleSend(text?: string) {
    const query = (text ?? input).trim();
    if (!query || loading) return;

    const userMsg: Message = { role: "user", content: query, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      const assistantMsg: Message = {
        role: "assistant",
        content: data.response ?? data.error ?? "No response.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Network error — could not reach the query engine.", timestamp: Date.now() },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 flex flex-col h-[480px]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <Zap className="w-4 h-4 text-emerald-500" />
        <span className="text-sm font-medium text-white">Ask about any stock</span>
        <span className="text-xs text-zinc-500 ml-auto">Deterministic · No LLM</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-zinc-500 text-sm mt-8">
            <Bot className="w-8 h-8 mx-auto mb-3 text-zinc-600" />
            <p className="mb-4">Ask me about any NGX stock.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLE_QUERIES.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-emerald-400" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-800 text-zinc-200"
              }`}
            >
              {msg.content.split("\n").map((line, j) => {
                // Simple bold rendering for **text**
                const parts = line.split(/(\*\*.*?\*\*)/g);
                return (
                  <span key={j}>
                    {j > 0 && <br />}
                    {parts.map((part, k) =>
                      part.startsWith("**") && part.endsWith("**") ? (
                        <strong key={k} className="font-semibold text-white">
                          {part.slice(2, -2)}
                        </strong>
                      ) : (
                        <span key={k}>{part}</span>
                      )
                    )}
                  </span>
                );
              })}
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="w-4 h-4 text-zinc-300" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="bg-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-400">
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-zinc-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='e.g., "Is GTCO bullish?"'
            className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
            disabled={loading}
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-1.5"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
