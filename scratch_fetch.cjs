const { TextEncoder, TextDecoder } = require('util');
const { TransformStream, ReadableStream } = require('stream/web');

// mock stripRAGFromObject
global.stripRAGFromObject = function(obj) {
  if (typeof obj === 'string') return obj.replace(/\[SİSTEM BİLGİSİ:[\s\S]*?\]\n*/g, '').trim();
  if (Array.isArray(obj)) return obj.map(item => global.stripRAGFromObject(item));
  if (typeof obj === 'object' && obj !== null) {
    const newObj = {};
    for (const key in obj) newObj[key] = global.stripRAGFromObject(obj[key]);
    return newObj;
  }
  return obj;
}

const originalFetch = async (...args) => {
  return new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode('data: {"messages":[{"content":"[SİSTEM BİLGİSİ: test]Real msg"}]}\n\ndata: [DONE]\n'));
        controller.close();
      }
    }),
    { headers: new Headers({ 'content-type': 'text/event-stream' }) }
  );
};

async function patchedFetch(...args) {
  const response = await originalFetch(...args);
  if (response.body) {
    let buffer = '';
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        console.log("TRANSFORMING CHUNK");
        const text = new TextDecoder().decode(chunk);
        buffer += text;
        let lines = buffer.split('\n');
        buffer = lines.pop(); 
        for (let line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              controller.enqueue(new TextEncoder().encode(line + '\n'));
              continue;
            }
            try {
              const obj = JSON.parse(data);
              const cleanObj = global.stripRAGFromObject(obj);
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(cleanObj)}\n`));
            } catch(e) {
              controller.enqueue(new TextEncoder().encode(line + '\n'));
            }
          } else {
            controller.enqueue(new TextEncoder().encode(line + '\n'));
          }
        }
      },
      flush(controller) {
        if (buffer) controller.enqueue(new TextEncoder().encode(buffer));
      }
    });
    return new Response(response.body.pipeThrough(transformStream), {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText
    });
  }
  return response;
}

async function run() {
  const res = await patchedFetch('test');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let output = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    output += decoder.decode(value);
  }
  console.log('OUTPUT:', JSON.stringify(output));
}
run();
