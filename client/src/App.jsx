import { useState, useEffect, useRef } from "react";
import {
  CheckCircle2, XCircle, Loader2, Send, RotateCcw, BookOpen,
  MessageSquare, BarChart3, Palette, FlaskConical, ChevronRight,
  AlertTriangle, Sparkles, Quote,
} from "lucide-react";
import { storageGet, storageSet } from "./storage.js";

/* =========================================================================
   TOKENS — single source of truth for color / type / space / motion.
   Every component below reads from this object. No magic numbers.
   ========================================================================= */
const TOKENS = {
  color: {
    ink: "#1C2333",
    inkSoft: "#5B6274",
    paper: "#F2F0EA",
    paperRaised: "#FFFFFF",
    line: "#DCD7C9",
    accent: "#C1741E",
    accentSoft: "#F1DBB8",
    success: "#2F8F5B",
    successSoft: "#DCEFE1",
    error: "#C24C4C",
    errorSoft: "#F7DEDE",
  },
  font: {
    display: "'Georgia', 'Iowan Old Style', serif",
    body: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
    mono: "'SFMono-Regular', 'JetBrains Mono', Menlo, monospace",
  },
  space: [0, 4, 8, 12, 16, 24, 32, 48, 64],
  radius: { sm: "6px", md: "10px", lg: "18px", full: "999px" },
  duration: { fast: 120, base: 240, slow: 420 },
  easing: {
    standard: "cubic-bezier(0.4,0,0.2,1)",
    decel: "cubic-bezier(0,0,0.2,1)",
    accel: "cubic-bezier(0.4,0,1,1)",
    bounce: "cubic-bezier(0.34,1.56,0.64,1)",
  },
  shadow: {
    sm: "0 1px 2px rgba(28,35,51,0.08)",
    md: "0 4px 14px rgba(28,35,51,0.10)",
    lg: "0 14px 34px rgba(28,35,51,0.16)",
  },
};

/* Global keyframes, timed off TOKENS so motion is never a magic number */
const GlobalStyle = () => (
  <style>{`
    @keyframes sb-shake {
      0%,100% { transform: translateX(0); }
      25% { transform: translateX(-6px); }
      75% { transform: translateX(6px); }
    }
    @keyframes sb-pulse {
      0%,100% { opacity: .35; }
      50% { opacity: .9; }
    }
    @keyframes sb-pop {
      0% { transform: scale(1); }
      45% { transform: scale(1.045); }
      100% { transform: scale(1); }
    }
    .sb-shake { animation: sb-shake ${TOKENS.duration.base}ms ${TOKENS.easing.accel}; }
    .sb-pop { animation: sb-pop ${TOKENS.duration.slow}ms ${TOKENS.easing.bounce}; }
    .sb-dot { animation: sb-pulse ${TOKENS.duration.slow * 3}ms ${TOKENS.easing.standard} infinite; }
  `}</style>
);

/* =========================================================================
   EVAL FIXTURES — original short passages authored for grounding checks
   ========================================================================= */
const EVAL_SET = [
  {
    topic: "Photosynthesis",
    text: `Photosynthesis is the process plants use to convert light energy into chemical energy. It happens in two stages. The light-dependent reactions occur in the thylakoid membrane, where chlorophyll absorbs sunlight and uses it to split water molecules, releasing oxygen as a byproduct and generating ATP and NADPH. These energy carriers then power the light-independent reactions, also called the Calvin cycle, which take place in the stroma of the chloroplast. During the Calvin cycle, carbon dioxide from the air is fixed into a three-carbon sugar using the enzyme RuBisCO, and this sugar is eventually built into glucose. Plants use the glucose for energy and as a building block for cellulose. Without the oxygen released during the light-dependent reactions, most animal life on Earth would not be able to breathe.`,
  },
  {
    topic: "TCP Three-Way Handshake",
    text: `Before two computers exchange data over TCP, they perform a three-way handshake to establish a reliable connection. First, the client sends a SYN packet to the server, which includes an initial sequence number chosen by the client. Second, the server responds with a SYN-ACK packet, acknowledging the client's sequence number and including its own initial sequence number. Third, the client sends an ACK packet back to the server, acknowledging the server's sequence number. Once this exchange completes, both sides have confirmed each other's sequence numbers and the connection is considered established, allowing data transfer to begin. This handshake exists because TCP is a connection-oriented protocol that guarantees ordered, reliable delivery, unlike UDP, which sends packets without first confirming that the other side is ready to receive them.`,
  },
  {
    topic: "India's Green Revolution",
    text: `India's Green Revolution took place mainly during the 1960s and transformed the country from a food-deficit nation into one that could feed itself. The shift centered on high-yielding varieties of wheat, many derived from breeding work by Norman Borlaug in Mexico, which were adapted for Indian conditions by agricultural scientist M. S. Swaminathan. These new wheat varieties produced far more grain per acre than traditional strains, especially when paired with irrigation, chemical fertilizers, and pesticides. The state of Punjab became the epicenter of this change, seeing wheat yields rise dramatically within a few growing seasons. While the Green Revolution greatly reduced the risk of famine, it also concentrated benefits among farmers who could afford fertilizer and irrigation, and it increased groundwater use in Punjab to levels that remain a concern today.`,
  },
];

/* =========================================================================
   API HELPERS — Claude API calls made directly from the artifact
   ========================================================================= */
async function callClaude(system, userContent, maxTokens = 1000) {
  const response = await fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `API request failed (${response.status})`);
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  return text;
}

function parseJsonLoose(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

async function generateQuiz(sourceText, topic) {
  const system = `You are a careful quiz writer. Using ONLY the provided source text, write exactly 5 multiple-choice questions that test understanding of the material. Every question must be answerable directly from the text — never invent facts that aren't there. Respond with ONLY valid JSON, no markdown fences, no commentary, matching exactly this schema:
{"questions":[{"question":"string","options":["string","string","string","string"],"correctIndex":0,"grounding":"a phrase of 6-12 words copied verbatim from the source text that proves the correct answer"}]}
Keep each question and option under 20 words.`;
  const text = await callClaude(system, `Topic: ${topic || "(untitled)"}\n\nSource text:\n${sourceText.slice(0, 6000)}`, 1000);
  const parsed = parseJsonLoose(text);
  if (!parsed.questions || !Array.isArray(parsed.questions)) throw new Error("Malformed quiz response");
  return parsed.questions;
}

async function judgeQuestion(sourceText, q) {
  const system = `You grade whether a quiz question is grounded in a source text and correctly answered. Respond with ONLY JSON: {"grounded":true|false,"correct":true|false,"reason":"short reason under 20 words"}`;
  const user = `Source text:\n${sourceText}\n\nQuestion: ${q.question}\nOptions: ${q.options.join(" | ")}\nMarked correct option: ${q.options[q.correctIndex]}\n\nIs this question answerable purely from the source text, and is the marked option actually the correct one according to the text?`;
  const text = await callClaude(system, user, 1000);
  return parseJsonLoose(text);
}

function chunkText(text) {
  let paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paras.length < 2) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    paras = [];
    for (let i = 0; i < sentences.length; i += 3) {
      paras.push(sentences.slice(i, i + 3).join(" ").trim());
    }
    paras = paras.filter(Boolean);
  }
  return paras.length ? paras : [text];
}

const STOPWORDS = new Set(["the", "a", "an", "is", "are", "of", "to", "in", "and", "on", "for", "with", "that", "this", "it", "as", "was", "were", "be", "by", "or", "at", "from", "its", "which", "what", "how", "does", "do", "did"]);

function retrieveChunks(query, chunks, k = 3) {
  const qTokens = (query.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => !STOPWORDS.has(t));
  const scored = chunks.map((c, i) => {
    const cTokens = c.toLowerCase().match(/[a-z0-9]+/g) || [];
    const score = qTokens.reduce((s, t) => s + (cTokens.includes(t) ? 1 : 0), 0);
    return { i, c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

async function askQuestion(question, chunks, history) {
  const top = retrieveChunks(question, chunks, 3);
  const context = top.map((t) => `[${t.i + 1}] ${t.c}`).join("\n\n");
  const system = `Answer the user's question using ONLY the numbered context chunks below, which come from material they're studying. If the context doesn't contain the answer, say plainly that the material doesn't cover it — never guess. Cite the chunk numbers you used in square brackets like [1] right after the relevant sentence. Be concise, 2-4 sentences.\n\nContext:\n${context}`;
  const historyText = history.map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.text}`).join("\n");
  const user = historyText ? `${historyText}\nStudent: ${question}` : question;
  const text = await callClaude(system, user, 1000);
  return { text, usedChunks: top };
}

/* =========================================================================
   SMALL UI COMPONENTS — the mini design system
   ========================================================================= */
function Button({ variant = "primary", size = "md", children, onClick, disabled, icon: Icon, className = "" }) {
  const base = {
    fontFamily: TOKENS.font.body,
    borderRadius: TOKENS.radius.md,
    transition: `all ${TOKENS.duration.fast}ms ${TOKENS.easing.standard}`,
    fontWeight: 600,
    border: "1px solid transparent",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
  const variants = {
    primary: { background: TOKENS.color.ink, color: TOKENS.color.paperRaised },
    accent: { background: TOKENS.color.accent, color: "#fff" },
    secondary: { background: TOKENS.color.paperRaised, color: TOKENS.color.ink, borderColor: TOKENS.color.line },
    ghost: { background: "transparent", color: TOKENS.color.inkSoft },
  };
  const sizes = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2 text-sm", lg: "px-5 py-3 text-base" };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ ...base, ...variants[variant] }}
      className={`inline-flex items-center gap-2 ${sizes[size]} ${className}`}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

function Badge({ tone = "neutral", children }) {
  const tones = {
    neutral: { background: TOKENS.color.paper, color: TOKENS.color.inkSoft },
    accent: { background: TOKENS.color.accentSoft, color: TOKENS.color.accent },
    success: { background: TOKENS.color.successSoft, color: TOKENS.color.success },
    error: { background: TOKENS.color.errorSoft, color: TOKENS.color.error },
  };
  return (
    <span
      style={{ ...tones[tone], borderRadius: TOKENS.radius.full, fontFamily: TOKENS.font.mono }}
      className="px-2.5 py-1 text-xs font-semibold inline-block"
    >
      {children}
    </span>
  );
}

function Card({ children, className = "", style = {} }) {
  return (
    <div
      style={{
        background: TOKENS.color.paperRaised,
        border: `1px solid ${TOKENS.color.line}`,
        borderRadius: TOKENS.radius.lg,
        boxShadow: TOKENS.shadow.sm,
        ...style,
      }}
      className={`p-5 ${className}`}
    >
      {children}
    </div>
  );
}

function ProgressBar({ indeterminate = true, value = 0 }) {
  return (
    <div
      style={{ background: TOKENS.color.paper, borderRadius: TOKENS.radius.full, height: 6, overflow: "hidden" }}
    >
      <div
        style={{
          height: "100%",
          width: indeterminate ? "40%" : `${value}%`,
          background: TOKENS.color.accent,
          borderRadius: TOKENS.radius.full,
          transition: `width ${TOKENS.duration.slow}ms ${TOKENS.easing.standard}`,
          animation: indeterminate ? `sb-indeterminate ${TOKENS.duration.slow * 3}ms ${TOKENS.easing.standard} infinite` : "none",
        }}
      />
      <style>{`
        @keyframes sb-indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
      `}</style>
    </div>
  );
}

function Skeleton({ lines = 3 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="sb-dot"
          style={{
            height: 12,
            width: i === lines - 1 ? "60%" : "100%",
            background: TOKENS.color.line,
            borderRadius: TOKENS.radius.sm,
            animationDelay: `${i * 120}ms`,
          }}
        />
      ))}
    </div>
  );
}

function LatencyLoader({ messages }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % messages.length), 2600);
    return () => clearInterval(id);
  }, [messages.length]);
  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <Sparkles size={18} color={TOKENS.color.accent} />
        <span style={{ fontFamily: TOKENS.font.body, color: TOKENS.color.ink }} className="text-sm font-semibold">
          {messages[i]}
        </span>
      </div>
      <ProgressBar indeterminate />
      <div className="mt-5">
        <Skeleton lines={4} />
      </div>
    </Card>
  );
}

function ErrorBanner({ message, onRetry }) {
  return (
    <Card style={{ background: TOKENS.color.errorSoft, borderColor: TOKENS.color.error }}>
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} color={TOKENS.color.error} className="mt-0.5 shrink-0" />
        <div className="flex-1">
          <div style={{ color: TOKENS.color.error, fontFamily: TOKENS.font.body }} className="text-sm font-semibold mb-1">
            That didn't work
          </div>
          <div style={{ color: TOKENS.color.ink }} className="text-sm mb-3">
            {message}
          </div>
          {onRetry && (
            <Button variant="secondary" size="sm" icon={RotateCcw} onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function CitationPill({ index, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: TOKENS.color.accentSoft,
        color: TOKENS.color.accent,
        borderRadius: TOKENS.radius.full,
        fontFamily: TOKENS.font.mono,
        transition: `transform ${TOKENS.duration.fast}ms ${TOKENS.easing.standard}`,
      }}
      className="text-xs font-bold px-2 py-0.5 mx-0.5 hover:scale-110"
    >
      [{index}]
    </button>
  );
}

function ChatBubble({ role, text, citations, onCiteClick }) {
  const isUser = role === "user";
  const parts = text.split(/(\[\d+\])/g);
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        style={{
          background: isUser ? TOKENS.color.ink : TOKENS.color.paperRaised,
          color: isUser ? "#fff" : TOKENS.color.ink,
          border: isUser ? "none" : `1px solid ${TOKENS.color.line}`,
          borderRadius: TOKENS.radius.lg,
          fontFamily: TOKENS.font.body,
        }}
        className="px-4 py-3 max-w-[80%] text-sm leading-relaxed"
      >
        {parts.map((p, idx) => {
          const m = p.match(/^\[(\d+)\]$/);
          if (m && !isUser) {
            return <CitationPill key={idx} index={m[1]} onClick={() => onCiteClick && onCiteClick(Number(m[1]))} />;
          }
          return <span key={idx}>{p}</span>;
        })}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex justify-start mb-3">
      <div
        style={{ background: TOKENS.color.paperRaised, border: `1px solid ${TOKENS.color.line}`, borderRadius: TOKENS.radius.lg }}
        className="px-4 py-3 flex gap-1.5 items-center"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="sb-dot"
            style={{ width: 6, height: 6, borderRadius: "50%", background: TOKENS.color.inkSoft, animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function QuizOptionButton({ label, index, state, onClick, disabled }) {
  // state: 'idle' | 'selected-correct' | 'selected-incorrect' | 'reveal-correct'
  const styles = {
    idle: { background: TOKENS.color.paperRaised, border: TOKENS.color.line, color: TOKENS.color.ink },
    "selected-correct": { background: TOKENS.color.successSoft, border: TOKENS.color.success, color: TOKENS.color.ink },
    "selected-incorrect": { background: TOKENS.color.errorSoft, border: TOKENS.color.error, color: TOKENS.color.ink },
    "reveal-correct": { background: TOKENS.color.successSoft, border: TOKENS.color.success, color: TOKENS.color.ink },
  };
  const s = styles[state] || styles.idle;
  const animClass = state === "selected-correct" ? "sb-pop" : state === "selected-incorrect" ? "sb-shake" : "";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-4 py-3 mb-2.5 flex items-center gap-3 ${animClass}`}
      style={{
        background: s.background,
        border: `1.5px solid ${s.border}`,
        color: s.color,
        borderRadius: TOKENS.radius.md,
        fontFamily: TOKENS.font.body,
        transition: `background ${TOKENS.duration.base}ms ${TOKENS.easing.standard}, border-color ${TOKENS.duration.base}ms ${TOKENS.easing.standard}, transform ${TOKENS.duration.base}ms ${TOKENS.easing.bounce}`,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      <span
        style={{
          fontFamily: TOKENS.font.mono,
          background: TOKENS.color.paper,
          borderRadius: TOKENS.radius.sm,
          width: 22,
          height: 22,
        }}
        className="inline-flex items-center justify-center text-xs font-bold shrink-0"
      >
        {String.fromCharCode(65 + index)}
      </span>
      <span className="text-sm flex-1">{label}</span>
      {state === "selected-correct" && <CheckCircle2 size={18} color={TOKENS.color.success} />}
      {state === "selected-incorrect" && <XCircle size={18} color={TOKENS.color.error} />}
      {state === "reveal-correct" && <CheckCircle2 size={18} color={TOKENS.color.success} />}
    </button>
  );
}

function NavTab({ active, icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        color: active ? TOKENS.color.ink : TOKENS.color.inkSoft,
        borderBottom: active ? `2px solid ${TOKENS.color.accent}` : "2px solid transparent",
        fontFamily: TOKENS.font.body,
        transition: `all ${TOKENS.duration.fast}ms ${TOKENS.easing.standard}`,
      }}
      className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold whitespace-nowrap"
    >
      <Icon size={15} />
      {label}
    </button>
  );
}

/* =========================================================================
   MAIN APP
   ========================================================================= */
export default function StudyBuddy() {
  const [view, setView] = useState("input");
  const [topic, setTopic] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [chunks, setChunks] = useState([]);

  const [quiz, setQuiz] = useState([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState(null);

  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [locked, setLocked] = useState(false);

  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [highlightChunk, setHighlightChunk] = useState(null);
  const chatEndRef = useRef(null);

  const [sessions, setSessions] = useState([]);
  const [evalState, setEvalState] = useState({ running: false, items: [] });

  useEffect(() => {
    (async () => {
      try {
        const res = await storageGet("quiz-sessions");
        if (res && res.value) setSessions(JSON.parse(res.value));
      } catch (e) {
        setSessions([]);
      }
    })();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  async function persistSessions(next) {
    setSessions(next);
    try {
      await storageSet("quiz-sessions", JSON.stringify(next));
    } catch (e) {
      console.error("Could not save session", e);
    }
  }

  async function handleGenerateQuiz() {
    if (!sourceText.trim()) return;
    setQuizLoading(true);
    setQuizError(null);
    try {
      const questions = await generateQuiz(sourceText, topic);
      setQuiz(questions);
      setChunks(chunkText(sourceText));
      setQIndex(0);
      setAnswers(new Array(questions.length).fill(null));
      setLocked(false);
      setMessages([]);
      setView("quiz");
    } catch (e) {
      setQuizError(e.message || "Something went wrong generating the quiz.");
    } finally {
      setQuizLoading(false);
    }
  }

  function selectOption(optIdx) {
    if (locked) return;
    const next = [...answers];
    next[qIndex] = optIdx;
    setAnswers(next);
    setLocked(true);
  }

  async function nextQuestion() {
    if (qIndex < quiz.length - 1) {
      setQIndex(qIndex + 1);
      setLocked(false);
    } else {
      const score = answers.reduce((s, a, i) => s + (a === quiz[i].correctIndex ? 1 : 0), 0);
      const session = { topic: topic || "Untitled material", score, total: quiz.length, date: new Date().toISOString() };
      await persistSessions([session, ...sessions].slice(0, 50));
      setView("results");
    }
  }

  async function handleAsk() {
    const q = chatInput.trim();
    if (!q || chatLoading) return;
    setChatInput("");
    setChatError(null);
    const nextMessages = [...messages, { role: "user", text: q }];
    setMessages(nextMessages);
    setChatLoading(true);
    try {
      const { text, usedChunks } = await askQuestion(q, chunks, messages);
      setMessages([...nextMessages, { role: "assistant", text, citations: usedChunks }]);
    } catch (e) {
      setChatError(e.message || "Couldn't reach the tutor. Check your connection and try again.");
    } finally {
      setChatLoading(false);
    }
  }

  async function runEvalSuite() {
    setEvalState({ running: true, items: [] });
    const results = [];
    for (const item of EVAL_SET) {
      try {
        const questions = await generateQuiz(item.text, item.topic);
        for (const q of questions) {
          const words = (q.grounding || "").toLowerCase().split(/\s+/).filter(Boolean);
          const hits = words.filter((w) => item.text.toLowerCase().includes(w)).length;
          const deterministicGrounded = words.length > 0 && hits / words.length >= 0.7;
          let judge = { grounded: null, correct: null, reason: "judge call failed" };
          try {
            judge = await judgeQuestion(item.text, q);
          } catch (e) {
            /* keep default */
          }
          results.push({ topic: item.topic, question: q.question, deterministicGrounded, judge });
          setEvalState({ running: true, items: [...results] });
        }
      } catch (e) {
        results.push({ topic: item.topic, error: e.message });
        setEvalState({ running: true, items: [...results] });
      }
    }
    setEvalState({ running: false, items: results });
  }

  const score = answers.reduce((s, a, i) => s + (quiz[i] && a === quiz[i].correctIndex ? 1 : 0), 0);

  return (
    <div style={{ background: TOKENS.color.paper, minHeight: "100vh", fontFamily: TOKENS.font.body }}>
      <GlobalStyle />
      <div style={{ borderBottom: `1px solid ${TOKENS.color.line}`, background: TOKENS.color.paperRaised }}>
        <div className="max-w-3xl mx-auto px-5 pt-5">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen size={20} color={TOKENS.color.accent} />
            <h1 style={{ fontFamily: TOKENS.font.display, color: TOKENS.color.ink }} className="text-xl font-bold">
              Study Buddy
            </h1>
          </div>
          <p style={{ color: TOKENS.color.inkSoft }} className="text-sm mb-2">
            Paste anything you're learning. Get a grounded quiz and a tutor that only speaks from your material.
          </p>
          <div className="flex overflow-x-auto -mb-px">
            <NavTab active={view === "input" || view === "quiz" || view === "results"} icon={FlaskConical} label="Quiz" onClick={() => setView(quiz.length ? "quiz" : "input")} />
            <NavTab active={view === "chat"} icon={MessageSquare} label="Ask about it" onClick={() => setView("chat")} />
            <NavTab active={view === "history"} icon={BarChart3} label="History" onClick={() => setView("history")} />
            <NavTab active={view === "styleguide"} icon={Palette} label="Style guide" onClick={() => setView("styleguide")} />
            <NavTab active={view === "evals"} icon={CheckCircle2} label="Evals" onClick={() => setView("evals")} />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 py-6">
        {view === "input" && (
          <div className="space-y-4">
            <Card>
              <label style={{ color: TOKENS.color.inkSoft }} className="text-xs font-semibold uppercase tracking-wide block mb-1">
                Topic (optional)
              </label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. TCP handshakes, Parkinson's biomarkers, the French Revolution"
                style={{ border: `1px solid ${TOKENS.color.line}`, borderRadius: TOKENS.radius.md, fontFamily: TOKENS.font.body }}
                className="w-full px-3 py-2 text-sm mb-4 outline-none"
              />
              <label style={{ color: TOKENS.color.inkSoft }} className="text-xs font-semibold uppercase tracking-wide block mb-1">
                Paste your source text
              </label>
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                rows={10}
                placeholder="Paste an article, notes, or a textbook excerpt here..."
                style={{ border: `1px solid ${TOKENS.color.line}`, borderRadius: TOKENS.radius.md, fontFamily: TOKENS.font.body }}
                className="w-full px-3 py-2 text-sm outline-none resize-none"
              />
              <div style={{ color: TOKENS.color.inkSoft }} className="text-xs mt-1 mb-4">
                {sourceText.trim().split(/\s+/).filter(Boolean).length} words
              </div>
              <Button variant="accent" onClick={handleGenerateQuiz} disabled={!sourceText.trim() || quizLoading} icon={Sparkles}>
                Generate quiz
              </Button>
            </Card>
            {quizLoading && (
              <LatencyLoader
                messages={[
                  "Reading your material...",
                  "Drafting questions from the text...",
                  "Checking each answer is grounded...",
                  "Almost done...",
                ]}
              />
            )}
            {quizError && <ErrorBanner message={quizError} onRetry={handleGenerateQuiz} />}
          </div>
        )}

        {view === "quiz" && quiz.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge tone="neutral">Question {qIndex + 1} of {quiz.length}</Badge>
              <Badge tone="accent">{topic || "Untitled material"}</Badge>
            </div>
            <Card>
              <div style={{ color: TOKENS.color.ink }} className="text-base font-semibold mb-4">
                {quiz[qIndex].question}
              </div>
              {quiz[qIndex].options.map((opt, i) => {
                let state = "idle";
                if (answers[qIndex] !== null && answers[qIndex] !== undefined) {
                  if (i === quiz[qIndex].correctIndex) state = "reveal-correct";
                  if (i === answers[qIndex] && i === quiz[qIndex].correctIndex) state = "selected-correct";
                  if (i === answers[qIndex] && i !== quiz[qIndex].correctIndex) state = "selected-incorrect";
                }
                return <QuizOptionButton key={i} index={i} label={opt} state={state} disabled={locked} onClick={() => selectOption(i)} />;
              })}
              {locked && (
                <div style={{ background: TOKENS.color.paper, borderRadius: TOKENS.radius.md }} className="mt-3 p-3 flex gap-2 items-start">
                  <Quote size={14} color={TOKENS.color.accent} className="mt-0.5 shrink-0" />
                  <div style={{ color: TOKENS.color.inkSoft, fontFamily: TOKENS.font.mono }} className="text-xs italic">
                    "{quiz[qIndex].grounding}"
                  </div>
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <Button variant="primary" onClick={nextQuestion} disabled={!locked} icon={ChevronRight}>
                  {qIndex < quiz.length - 1 ? "Next question" : "See results"}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {view === "results" && (
          <Card className="text-center py-10">
            <div style={{ fontFamily: TOKENS.font.display, color: TOKENS.color.ink }} className="text-4xl font-bold mb-2">
              {score} / {quiz.length}
            </div>
            <div style={{ color: TOKENS.color.inkSoft }} className="text-sm mb-6">
              on {topic || "Untitled material"}
            </div>
            <div className="flex gap-3 justify-center">
              <Button variant="secondary" icon={MessageSquare} onClick={() => setView("chat")}>
                Ask follow-up questions
              </Button>
              <Button variant="accent" icon={RotateCcw} onClick={() => setView("input")}>
                New topic
              </Button>
            </div>
          </Card>
        )}

        {view === "chat" && (
          <div className="space-y-3">
            {chunks.length === 0 ? (
              <Card style={{ textAlign: "center" }}>
                <p style={{ color: TOKENS.color.inkSoft }} className="text-sm py-6">
                  Generate a quiz first — the tutor grounds every answer in that same material.
                </p>
                <Button variant="accent" onClick={() => setView("input")}>Paste material</Button>
              </Card>
            ) : (
              <>
                <Card style={{ minHeight: 340, maxHeight: 440, overflowY: "auto" }}>
                  {messages.length === 0 && (
                    <p style={{ color: TOKENS.color.inkSoft }} className="text-sm">
                      Ask anything about "{topic || "your material"}" — answers are grounded only in the text you pasted, with citations back to the source chunk.
                    </p>
                  )}
                  {messages.map((m, i) => (
                    <ChatBubble key={i} role={m.role} text={m.text} citations={m.citations} onCiteClick={setHighlightChunk} />
                  ))}
                  {chatLoading && <ThinkingDots />}
                  <div ref={chatEndRef} />
                </Card>
                {chatError && <ErrorBanner message={chatError} onRetry={handleAsk} />}
                {highlightChunk !== null && chunks[highlightChunk - 1] && (
                  <Card style={{ background: TOKENS.color.accentSoft }}>
                    <div style={{ color: TOKENS.color.accent, fontFamily: TOKENS.font.mono }} className="text-xs font-bold mb-1">
                      Source chunk [{highlightChunk}]
                    </div>
                    <div style={{ color: TOKENS.color.ink }} className="text-sm">{chunks[highlightChunk - 1]}</div>
                  </Card>
                )}
                <div className="flex gap-2">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAsk()}
                    placeholder="Ask about the material..."
                    style={{ border: `1px solid ${TOKENS.color.line}`, borderRadius: TOKENS.radius.md }}
                    className="flex-1 px-3 py-2 text-sm outline-none"
                  />
                  <Button variant="accent" icon={Send} onClick={handleAsk} disabled={chatLoading || !chatInput.trim()}>
                    Ask
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {view === "history" && (
          <div className="space-y-3">
            {sessions.length === 0 ? (
              <Card><p style={{ color: TOKENS.color.inkSoft }} className="text-sm text-center py-6">No quizzes taken yet.</p></Card>
            ) : (
              sessions.map((s, i) => {
                const pct = Math.round((s.score / s.total) * 100);
                return (
                  <Card key={i} className="flex items-center justify-between">
                    <div>
                      <div style={{ color: TOKENS.color.ink }} className="text-sm font-semibold">{s.topic}</div>
                      <div style={{ color: TOKENS.color.inkSoft }} className="text-xs">{new Date(s.date).toLocaleString()}</div>
                    </div>
                    <Badge tone={pct >= 70 ? "success" : pct >= 40 ? "accent" : "error"}>{s.score}/{s.total}</Badge>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {view === "styleguide" && <StyleGuide />}

        {view === "evals" && (
          <div className="space-y-4">
            <Card>
              <div style={{ color: TOKENS.color.ink }} className="text-sm font-semibold mb-1">Grounding eval suite</div>
              <p style={{ color: TOKENS.color.inkSoft }} className="text-xs mb-4">
                Runs quiz generation against {EVAL_SET.length} fixed reference passages, then checks each question two ways: a deterministic substring/word-overlap check against the source text, and an independent LLM judge call that verifies the marked answer is actually correct.
              </p>
              <Button variant="accent" onClick={runEvalSuite} disabled={evalState.running} icon={FlaskConical}>
                {evalState.running ? "Running..." : "Run evals"}
              </Button>
            </Card>
            {evalState.running && evalState.items.length === 0 && <LatencyLoader messages={["Generating quizzes for each fixture...", "Judging groundedness..."]} />}
            {evalState.items.length > 0 && (
              <>
                <Card>
                  {(() => {
                    const total = evalState.items.filter((r) => !r.error).length;
                    const passed = evalState.items.filter((r) => !r.error && r.deterministicGrounded && r.judge?.grounded && r.judge?.correct).length;
                    return (
                      <div className="flex items-center gap-3">
                        <div style={{ fontFamily: TOKENS.font.display, color: TOKENS.color.ink }} className="text-2xl font-bold">
                          {total ? Math.round((passed / total) * 100) : 0}%
                        </div>
                        <div style={{ color: TOKENS.color.inkSoft }} className="text-xs">
                          {passed}/{total} questions pass both the deterministic grounding check and the LLM judge
                        </div>
                      </div>
                    );
                  })()}
                </Card>
                {evalState.items.map((r, i) => (
                  <Card key={i}>
                    {r.error ? (
                      <div style={{ color: TOKENS.color.error }} className="text-sm">{r.topic}: {r.error}</div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-1">
                          <Badge tone="neutral">{r.topic}</Badge>
                          <div className="flex gap-1.5">
                            <Badge tone={r.deterministicGrounded ? "success" : "error"}>substring {r.deterministicGrounded ? "pass" : "fail"}</Badge>
                            <Badge tone={r.judge?.grounded && r.judge?.correct ? "success" : "error"}>judge {r.judge?.grounded && r.judge?.correct ? "pass" : "fail"}</Badge>
                          </div>
                        </div>
                        <div style={{ color: TOKENS.color.ink }} className="text-sm mb-1">{r.question}</div>
                        <div style={{ color: TOKENS.color.inkSoft }} className="text-xs italic">{r.judge?.reason}</div>
                      </>
                    )}
                  </Card>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   STYLE GUIDE — documents every token and component used above
   ========================================================================= */
function StyleGuide() {
  const [demoState, setDemoState] = useState("idle");
  return (
    <div className="space-y-6">
      <Card>
        <div style={{ fontFamily: TOKENS.font.display, color: TOKENS.color.ink }} className="text-lg font-bold mb-1">Color</div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {Object.entries(TOKENS.color).map(([name, hex]) => (
            <div key={name}>
              <div style={{ background: hex, borderRadius: TOKENS.radius.md, height: 48, border: `1px solid ${TOKENS.color.line}` }} />
              <div style={{ fontFamily: TOKENS.font.mono, color: TOKENS.color.inkSoft }} className="text-[10px] mt-1">{name}<br />{hex}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div style={{ fontFamily: TOKENS.font.display, color: TOKENS.color.ink }} className="text-lg font-bold mb-3">Type</div>
        <div style={{ fontFamily: TOKENS.font.display, color: TOKENS.color.ink }} className="text-2xl font-bold mb-1">Display / Georgia — headings</div>
        <div style={{ fontFamily: TOKENS.font.body, color: TOKENS.color.ink }} className="text-sm mb-1">Body / system sans — paragraphs and UI</div>
        <div style={{ fontFamily: TOKENS.font.mono, color: TOKENS.color.inkSoft }} className="text-sm">Mono / SFMono — citations, grounding quotes, tokens</div>
      </Card>

      <Card>
        <div style={{ fontFamily: TOKENS.font.display, color: TOKENS.color.ink }} className="text-lg font-bold mb-3">Space & radius</div>
        <div className="flex items-end gap-2 mb-4">
          {TOKENS.space.map((s) => (
            <div key={s} style={{ width: 16, height: s || 2, background: TOKENS.color.accent }} title={`${s}px`} />
          ))}
        </div>
        <div className="flex gap-3">
          {Object.entries(TOKENS.radius).map(([name, r]) => (
            <div key={name} style={{ borderRadius: r, background: TOKENS.color.paper, border: `1px solid ${TOKENS.color.line}` }} className="w-14 h-10 flex items-center justify-center text-[10px]">{name}</div>
          ))}
        </div>
      </Card>

      <Card>
        <div style={{ fontFamily: TOKENS.font.display, color: TOKENS.color.ink }} className="text-lg font-bold mb-1">Motion</div>
        <p style={{ color: TOKENS.color.inkSoft }} className="text-xs mb-3">
          duration.fast {TOKENS.duration.fast}ms · duration.base {TOKENS.duration.base}ms · duration.slow {TOKENS.duration.slow}ms · easing.bounce {TOKENS.easing.bounce}
        </p>
        <div className="flex gap-3 items-center">
          <Button variant="secondary" size="sm" onClick={() => setDemoState("selected-correct")}>Demo correct</Button>
          <Button variant="secondary" size="sm" onClick={() => setDemoState("selected-incorrect")}>Demo incorrect</Button>
          <Button variant="ghost" size="sm" onClick={() => setDemoState("idle")}>Reset</Button>
        </div>
        <div className="mt-3">
          <QuizOptionButton index={0} label="Sample answer option" state={demoState} onClick={() => {}} />
        </div>
      </Card>

      <Card>
        <div style={{ fontFamily: TOKENS.font.display, color: TOKENS.color.ink }} className="text-lg font-bold mb-3">Components</div>
        <div className="space-y-4">
          <div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="primary">Primary</Button>
              <Button variant="accent">Accent</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge tone="neutral">Neutral</Badge>
            <Badge tone="accent">Accent</Badge>
            <Badge tone="success">Success</Badge>
            <Badge tone="error">Error</Badge>
          </div>
          <ProgressBar indeterminate />
          <Skeleton lines={2} />
          <ErrorBanner message="Example error banner with a retry action." onRetry={() => {}} />
          <ChatBubble role="assistant" text="Grounded tutor answers cite chunks like [1] inline." citations={[]} onCiteClick={() => {}} />
        </div>
      </Card>
    </div>
  );
}
