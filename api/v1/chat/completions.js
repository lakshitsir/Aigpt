// Runtime: Node.js (Vercel Serverless Gateway)
// Target: High-Availability Keyless API Routing & Bypass Engine

export default async function handler(req, res) {
  // 1. Global CORS Setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let messages = [];
    let requestedModel = 'claude-opus-4.8';
    let stream = false;

    // 2. Parse GET Requests (Direct Browser Links, URL Queries)
    if (req.method === 'GET') {
      const { prompt, text, q, model, stream: reqStream } = req.query;
      const userPrompt = prompt || text || q;

      if (!userPrompt) {
        return res.status(400).json({
          error: {
            message: 'Query parameter missing. Format: ?prompt=your_question&model=claude-opus-4.8',
            example: `https://${req.headers.host || 'your-proxy.vercel.app'}/?prompt=Hello&model=gpt-5.5`
          }
        });
      }

      messages = [{ role: 'user', content: userPrompt }];
      if (model) requestedModel = model;
      if (reqStream === 'true') stream = true;
    }

    // 3. Parse POST Requests (Standard OpenAI SDK / Custom UIs)
    else if (req.method === 'POST') {
      const body = req.body || {};
      messages = body.messages || [];
      if (body.model) requestedModel = body.model;
      if (body.stream) stream = body.stream;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: { message: 'POST body must contain a valid messages array' } });
      }
    } else {
      return res.status(405).json({ error: { message: 'Method Not Allowed' } });
    }

    // 4. Advanced Model Routing Matrix
    const modelRoutingMap = {
      // Anthropic Frontier Models
      'claude-opus-4.8': 'claude-hybrid',
      'claude-4.8': 'claude-hybrid',
      'claude-opus': 'claude-hybrid',
      'claude-sonnet-5': 'claude-hybrid',
      'claude': 'claude-hybrid',

      // OpenAI Frontier Models
      'gpt-5.5': 'openai',
      'gpt-5': 'openai',
      'gpt-6': 'openai',
      'gpt-4o': 'openai',

      // Reasoning & Open-Weight Flagships
      'deepseek-r1': 'deepseek-r1',
      'r1': 'deepseek-r1',
      'deepseek-v4': 'deepseek-r1',
      'gemini-3.5-pro': 'gemini',
      'gemini': 'gemini',
      'grok-4': 'grok-reasoning',
      'qwen-coder': 'qwen-coder'
    };

    const targetModel = modelRoutingMap[requestedModel.toLowerCase()] || 'openai';

    // 5. Anti-Rate-Limit & Anti-IP-Ban Subsystem (Dynamic Header & IP Spoofing Engine)
    const generateRandomIP = () => Array.from({ length: 4 }, () => Math.floor(Math.random() * 254) + 1).join('.');
    const spoofedIp = generateRandomIP();

    const proxyHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
      'X-Forwarded-For': spoofedIp,
      'X-Real-IP': spoofedIp,
      'Client-IP': spoofedIp,
      'Accept': '*/*'
    };

    const payload = {
      messages: messages,
      model: targetModel,
      stream: stream,
      jsonMode: false
    };

    // Primary Gateway Endpoint
    let upstreamResponse = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: proxyHeaders,
      body: JSON.stringify(payload)
    });

    // Tier 2 Fallback Execution Gate (Triggered if Primary Gateway drops connection)
    if (!upstreamResponse.ok) {
      payload.model = 'openai';
      upstreamResponse = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: proxyHeaders,
        body: JSON.stringify(payload)
      });
    }

    if (!upstreamResponse.ok) {
      const errText = await upstreamResponse.text();
      return res.status(upstreamResponse.status).json({
        error: { message: `Backend service execution error: ${errText}` }
      });
    }

    // 6. Handle SSE Streaming
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = upstreamResponse.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.trim()) {
            const sseChunk = {
              id: `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: requestedModel,
              choices: [{ index: 0, delta: { content: line }, finish_reason: null }]
            };
            res.write(`data: ${JSON.stringify(sseChunk)}\n\n`);
          }
        }
      }
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // 7. Non-Streaming Response
    const responseText = await upstreamResponse.text();

    // Direct Browser HTML/Plaintext handling for GET requests
    const isBrowser = req.headers['accept']?.includes('text/html');
    if (req.method === 'GET' && isBrowser) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(responseText);
    }

    // Standard OpenAI JSON Format Output
    return res.status(200).json({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: requestedModel,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: responseText },
          finish_reason: 'stop'
        }
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    });

  } catch (err) {
    return res.status(500).json({
      error: { message: err.message || 'Serverless Execution Engine Failure' }
    });
  }
}

