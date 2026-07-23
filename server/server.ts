import app from './app';
import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';

process.on('uncaughtException', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Server] Port ${process.env.PORT || 3000} is currently in use by another instance.`);
    process.exit(0);
  }
  console.error('Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

async function startServer() {
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // Vite middleware for development or static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`  🚀 DESCO Prepaid Dashboard Live: http://localhost:${PORT}`);
    console.log(`=======================================================`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}
