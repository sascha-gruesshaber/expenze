import { createFileRoute } from '@tanstack/react-router';
import { useState, useRef, useEffect } from 'react';
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react';
import { Send, Square, Bot, User, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Models often stream markdown tables as a single line.
 *  Insert newlines at row boundaries so react-markdown can parse them. */
function fixMarkdown(text: string): string {
  // "| ..." end-of-row then "| ..." start-of-row, with 0+ spaces between
  return text.replace(/\|\s*\|/g, (match) => {
    // Only insert newline if there isn't one already
    if (match.includes('\n')) return match;
    return '|\n|';
  });
}

export const Route = createFileRoute('/chat')({
  component: ChatPage,
});

const TOOL_LABELS: Record<string, string> = {
  queryTransactions: 'Transaktionen suchen',
  getMonthlyAnalysis: 'Monatliche Analyse',
  getCategoryBreakdown: 'Kategorie-Aufschluesselung',
  getSummary: 'Zusammenfassung laden',
  getAccounts: 'Konten abrufen',
  getCategoryMonthly: 'Kategorie-Trends',
};

const SUGGESTIONS = [
  'Wie viel habe ich diesen Monat ausgegeben?',
  'Was sind meine groessten Ausgabenkategorien?',
  'Zeig mir meine letzten 10 Transaktionen',
  'Wie haben sich meine Ausgaben im letzten Jahr entwickelt?',
];

function ChatPage() {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, isLoading, stop, error } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function handleSuggestion(text: string) {
    sendMessage(text);
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-[calc(100vh-65px)] -m-6 -mt-6">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          <div className="flex flex-col items-center justify-center h-full px-6">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
              <Sparkles size={24} className="text-accent" />
            </div>
            <h2 className="font-heading font-bold text-lg text-text mb-1">KI-Assistent</h2>
            <p className="text-[13px] text-text-3 mb-8 text-center max-w-md">
              Stelle Fragen zu deinen Finanzdaten. Ich kann Transaktionen suchen, Ausgaben analysieren und Trends erkennen.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestion(s)}
                  className="text-left px-4 py-3 rounded-xl border border-border bg-surface hover:bg-surface-2 hover:border-border-2 transition-all text-[13px] text-text-2 hover:text-text cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot size={15} className="text-accent" />
                </div>
                <div className="flex items-center gap-2 text-[13px] text-text-3">
                  <Loader2 size={14} className="animate-spin" />
                  Denke nach...
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-6 pb-2 max-w-3xl mx-auto w-full">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/8 border border-red-500/20 text-[13px] text-red-400">
            <AlertCircle size={14} />
            {error.message || 'Ein Fehler ist aufgetreten'}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-border bg-surface px-6 py-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Frage zu deinen Finanzen..."
              rows={1}
              className="w-full resize-none rounded-xl border border-border bg-surface-2 px-4 py-3 text-[13px] text-text placeholder:text-text-3 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-colors"
              style={{ minHeight: '44px', maxHeight: '120px' }}
              disabled={isLoading}
            />
          </div>
          {isLoading ? (
            <button
              type="button"
              onClick={stop}
              className="h-[44px] w-[44px] rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors flex items-center justify-center flex-shrink-0 cursor-pointer"
              title="Stopp"
            >
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="h-[44px] w-[44px] rounded-xl bg-accent text-white hover:bg-accent/90 transition-colors flex items-center justify-center flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              title="Senden"
            >
              <Send size={16} />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: any }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
        isUser ? 'bg-accent/10' : 'bg-accent/10'
      }`}>
        {isUser ? <User size={15} className="text-accent" /> : <Bot size={15} className="text-accent" />}
      </div>
      <div className={`flex flex-col gap-1.5 min-w-0 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
        {message.parts?.map((part: any, idx: number) => {
          if (part.type === 'text' && part.content) {
            return isUser ? (
              <div
                key={idx}
                className="rounded-xl px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words bg-accent text-white"
              >
                {part.content}
              </div>
            ) : (
              <div
                key={idx}
                className="rounded-xl px-4 py-2.5 text-[13px] leading-relaxed break-words bg-surface-2 border border-border text-text chat-markdown"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{fixMarkdown(part.content)}</ReactMarkdown>
              </div>
            );
          }
          if (part.type === 'tool-call') {
            return (
              <div
                key={idx}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/5 border border-accent/10 text-[11px] text-accent font-medium"
              >
                {part.state === 'running' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                {TOOL_LABELS[part.name] || part.name}
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
