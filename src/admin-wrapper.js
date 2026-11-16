import worker from './worker.js';

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && (url.pathname === '/admin' || url.pathname === '/admin/')) {
      const target = new URL('/admin.html', url);
      return worker.fetch(new Request(target, { method: 'GET', headers: request.headers }), env, ctx);
    }
    return worker.fetch(request, env, ctx);
  }
};
