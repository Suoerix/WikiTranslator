// Diagnose raw SSE stream from the OpenAI-compatible endpoint
const base = (process.env.OPENAI_BASE_URL || '').replace(/\/+$/, '');
const url = base + '/chat/completions';
console.log('endpoint:', url);
console.log('model:', process.env.LLM_MODEL);

const longText = `Translate the following to Simplified Chinese and return a JSON object with translatedTitle and translatedBody.

Title: Community notes: admins decline, ArbCom elections and a new Wikipedian in Residence

Body: The Wikimedia Foundation announced this week that it is launching a new pilot program to support small language wikis. The program, which will run for eighteen months, aims to provide technical resources and mentorship to communities editing in underrepresented languages. In other news, the Arbitration Committee opened a case request concerning conduct on a WikiProject related to military history. Several editors expressed concerns about battleground behavior and tendentious editing during the discussion. Meanwhile, three new administrators were confirmed this month after a successful request for adminship process, with participation rates higher than the previous quarter. The Signpost also interviewed a long-time contributor who recently completed a Wikidata project linking fifty thousand bibliographic entries across multiple libraries worldwide. The project, which took over two years, involved collaboration with several chapter organizations and volunteer developers.`;

const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  },
  body: JSON.stringify({
    model: process.env.LLM_MODEL,
    stream: true,
    messages: [{ role: 'user', content: longText }],
  }),
});

console.log('HTTP status:', res.status);
if (!res.ok) {
  console.log(await res.text());
  process.exit(1);
}

const stats = { content: 0, reasoning_content: 0, other: 0 };
let sampleContent = '', sampleReasoning = '';
let fullContent = '', fullReasoning = '';
let finishReason = null, usage = null;

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  const lines = buf.split('\n');
  buf = lines.pop();
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const data = t.slice(5).trim();
    if (data === '[DONE]') continue;
    try {
      const j = JSON.parse(data);
      const d = j.choices?.[0]?.delta || {};
      if (typeof d.content === 'string' && d.content.length) {
        stats.content++;
        fullContent += d.content;
        if (sampleContent.length < 80) sampleContent += d.content;
      }
      if (typeof d.reasoning_content === 'string' && d.reasoning_content.length) {
        stats.reasoning_content++;
        fullReasoning += d.reasoning_content;
        if (sampleReasoning.length < 80) sampleReasoning += d.reasoning_content;
      }
      const extra = Object.keys(d).filter(k => !['content', 'reasoning_content', 'role'].includes(k));
      if (extra.length) { stats.other++; if (stats.other < 5) console.log('extra delta keys:', extra.join(','), JSON.stringify(d).slice(0, 120)); }
      if (j.choices?.[0]?.finish_reason) finishReason = j.choices[0].finish_reason;
      if (j.usage) usage = j.usage;
    } catch {}
  }
}

console.log('delta counts:', JSON.stringify(stats));
console.log('finish_reason:', finishReason, '| usage:', JSON.stringify(usage));
console.log('content sample:', JSON.stringify(sampleContent));
console.log('reasoning sample:', JSON.stringify(sampleReasoning));
console.log('content length:', fullContent.length, '| reasoning length:', fullReasoning.length);
const fs = await import('fs');
fs.writeFileSync('C:/Users/Eric/AppData/Local/Temp/opencode/sse-diag.json',
  JSON.stringify({ stats, finishReason, usage, fullContent, fullReasoning }, null, 2), 'utf8');
console.log('full dump saved');
