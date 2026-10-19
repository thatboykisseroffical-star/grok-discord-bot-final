import fetch from "node-fetch";

export async function makeGrokCall(prompt, { maxTokens = 800, temperature = 0.8, system = "" } = {}) {
  const url = process.env.GROK_API_URL;
  const key = process.env.GROK_API_KEY;

  if (!url || !key) {
    throw new Error("Set GROK_API_URL and GROK_API_KEY in your environment");
  }

  const payload = {
    model: "grok-2-latest",
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      { role: "user", content: prompt }
    ],
    max_tokens: maxTokens,
    temperature
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Grok API error ${response.status}: ${text}`);
  }

  const data = await response.json();

  if (data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  }

  if (data.output?.[0]?.content) {
    return data.output[0].content;
  }

  if (data.message?.content) {
    return data.message.content;
  }

  if (data.text) {
    return data.text;
  }

  return JSON.stringify(data);
}
