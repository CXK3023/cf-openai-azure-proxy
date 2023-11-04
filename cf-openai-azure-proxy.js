// The name of your Azure OpenAI Resource.
const resourceName="RESOURCE_NAME"

// The deployment name you chose when you deployed the model.
const mapper = {
    'gpt-3.5-turbo': 'gpt-35-turbo',
    'gpt-3.5-turbo-16k': 'gpt-35-turbo-16k',
    'gpt-4': 'gpt-4',
    'gpt-4-32k': 'gpt-4-32k',
};

const apiVersion="2023-07-01-preview"

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  if (request.method === 'OPTIONS') {
    return handleOPTIONS(request)
  }

  // If the request method is not POST, return a 405 error.
  if (request.method !== 'POST') {
    return new Response("Method Not Allowed", {
      status: 405
    });
  }

  const url = new URL(request.url);
  if (url.pathname.startsWith("//")) {
    url.pathname = url.pathname.replace('/',"")
  }
  if (url.pathname === '/v1/chat/completions') {
    var path="chat/completions"
  } else if (url.pathname === '/v1/completions') {
    var path="completions"
  } else if (url.pathname === '/v1/models') {
    return handleModels(request)
  } else {
    return new Response('404 Not Found', { status: 404 })
  }

  let body;
  if (request.method === 'POST') {
    body = await request.json();
  }

  const modelName = body?.model;  
  const deployName = mapper[modelName] || '' 

  if (deployName === '') {
    return new Response('Missing model mapper', {
        status: 403
    });
  }
  const fetchAPI = `https://${resourceName}.openai.azure.com/openai/deployments/${deployName}/${path}?api-version=${apiVersion}`

  const authKey = request.headers.get('Authorization');
  if (!authKey) {
    return new Response("Not allowed", {
      status: 403
    });
  }

  const payload = {
    method: request.method,
    headers: {
      "Content-Type": "application/json",
      "api-key": authKey.replace('Bearer ', ''),
    },
    body: typeof body === 'object' ? JSON.stringify(body) : '{}',
  };

  let response = await fetch(fetchAPI, payload);
  response = new Response(response.body, response);
  response.headers.set("Access-Control-Allow-Origin", "*");

  if (body?.stream != true){
    return response
  } 

  let { readable, writable } = new TransformStream()
  stream(response.body, writable);
  return new Response(readable, response);

}

async function stream(readable, writable) {
  const reader = readable.getReader();
  const writer = writable.getWriter();

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const delimiter = "\n\n";
  let buffer = "";
  let waitTime = 20; // 初始化一个基本等待时间（毫秒）

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    // 确保流的连续性，避免截断字符
    buffer += decoder.decode(value, { stream: true });

    // 使用分隔符分割缓冲区内容
    let lines = buffer.split(delimiter);

    // 对于每一行（除了可能不完整的最后一行），写入流并等待
    for (let i = 0; i < lines.length - 1; i++) {
      await writer.write(encoder.encode(lines[i] + delimiter));
      // 根据缓冲区大小动态调整等待时间
      waitTime = calculateWaitTime(lines[i]);
      await sleep(waitTime);
    }

    // 保留未处理的数据（最后一行可能不完整）
    buffer = lines[lines.length - 1];
  }

  // 如果缓冲区中还有剩余内容，确保写入流
  if (buffer) {
    await writer.write(encoder.encode(buffer + delimiter));
  }
  
  // 结束写入
  await writer.close();
}

function calculateWaitTime(line) {
  // 基于当前行长度动态调整等待时间
  // 等待时间与行长度成反比，行越长，等待时间越短
  const maxWaitTime = 50; // 最大等待时间（毫秒）
  const minWaitTime = 10; // 最小等待时间（毫秒）
  const lineLength = line.length;
  const threshold = 1024; // 阈值设定为1024个字符

  if (lineLength > threshold) {
    return minWaitTime; // 如果行长度超过阈值，使用最小等待时间
  } else {
    // 计算等待时间，使其与行长度成比例地减少
    // 线性插值: waitTime = maxWaitTime - (lineLength/threshold) * (maxWaitTime - minWaitTime)
    return maxWaitTime - ((lineLength / threshold) * (maxWaitTime - minWaitTime));
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


async function handleModels(request) {
  const data = {
    "object": "list",
    "data": []  
  };

  for (let key in mapper) {
    data.data.push({
      "id": key,
      "object": "model",
      "created": 1677610602,
      "owned_by": "openai",
      "permission": [{
        "id": "modelperm-M56FXnG1AsIr3SXq8BYPvXJA",
        "object": "model_permission",
        "created": 1679602088,
        "allow_create_engine": false,
        "allow_sampling": true,
        "allow_logprobs": true,
        "allow_search_indices": false,
        "allow_view": true,
        "allow_fine_tuning": false,
        "organization": "*",
        "group": null,
        "is_blocking": false
      }],
      "root": key,
      "parent": null
    });  
  }

  const json = JSON.stringify(data, null, 2);
  return new Response(json, {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleOPTIONS(request) {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      }
    })
}
