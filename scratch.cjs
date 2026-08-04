const { TextEncoder, TextDecoder } = require('util');
const { TransformStream, ReadableStream } = require('stream/web');

function stripRAGFromObject(obj) {
  if (typeof obj === 'string') {
    let result = obj.replace(/\[SİSTEM BİLGİSİ:[\s\S]*?\]\n*/g, '');
    return result.trim();
  }
  if (Array.isArray(obj)) {
    return obj.map(item => stripRAGFromObject(item));
  }
  if (typeof obj === 'object' && obj !== null) {
    const newObj = {};
    for (const key in obj) {
      newObj[key] = stripRAGFromObject(obj[key]);
    }
    return newObj;
  }
  return obj;
}

let buffer = '';
const transformStream = new TransformStream({
  transform(chunk, controller) {
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
          const cleanObj = stripRAGFromObject(obj);
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(cleanObj)}\n`));
        } catch(e) {
          console.error('ERROR PARSING:', e);
          controller.enqueue(new TextEncoder().encode(line + '\n'));
        }
      } else {
        controller.enqueue(new TextEncoder().encode(line + '\n'));
      }
    }
  },
  flush(controller) {
    if (buffer) {
      controller.enqueue(new TextEncoder().encode(buffer));
    }
  }
});

const rs = new ReadableStream({
  start(c) {
    c.enqueue(new TextEncoder().encode('data: {"messages":[{"content":"[SİSTEM BİLGİSİ: test]Real msg"}]}\n\ndata: [DONE]\n'));
    c.close();
  }
});

async function run() {
  const reader = rs.pipeThrough(transformStream).getReader();
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
