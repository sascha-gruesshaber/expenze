const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const MODEL = 'anthropic/claude-3.5-haiku';

interface SuggestContext {
  counterparty: string;
  description: string;
  category: string;
  sampleDescriptions: string[];
}

interface SuggestResult {
  pattern: string;
  match_type: 'regex' | 'keyword';
  match_field: string;
  explanation: string;
}

export async function suggestCategoryPattern(context: SuggestContext): Promise<SuggestResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  const prompt = `Du bist ein Experte für Banktransaktions-Kategorisierung. Analysiere diese Transaktion und schlage ein Muster vor, das ähnliche Transaktionen automatisch der Kategorie "${context.category}" zuordnet.

Transaktion:
- Empfänger: ${context.counterparty}
- Beschreibung: ${context.description}

Ähnliche Transaktionen:
${context.sampleDescriptions.map(s => `- ${s}`).join('\n')}

Antworte NUR mit einem JSON-Objekt (keine Markdown-Formatierung):
{
  "pattern": "das regex-muster oder stichwort",
  "match_type": "regex" oder "keyword",
  "match_field": "description" oder "counterparty" oder "both",
  "explanation": "kurze deutsche Erklärung warum dieses Muster gewählt wurde"
}

Bevorzuge einfache, robuste Muster. Verwende "keyword" wenn ein einfaches Stichwort ausreicht. Verwende "regex" nur wenn mehrere Varianten abgedeckt werden müssen.`;

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter error: ${res.status} ${text}`);
  }

  const data: any = await res.json();
  const content = data.choices?.[0]?.message?.content || '';

  // Parse JSON from response (handle potential markdown wrapping)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI returned invalid response format');
  }

  const result = JSON.parse(jsonMatch[0]);
  return {
    pattern: result.pattern || context.counterparty,
    match_type: result.match_type === 'keyword' ? 'keyword' : 'regex',
    match_field: ['description', 'counterparty', 'both'].includes(result.match_field) ? result.match_field : 'description',
    explanation: result.explanation || '',
  };
}
