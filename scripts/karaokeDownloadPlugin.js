import { createKaraokeDownloadHandler } from './karaokeDownloadCore.js';

export function karaokeDownloadPlugin() {
  const handleKaraokeDownload = createKaraokeDownloadHandler({ localhostOnly: true });
  return {
    name: 'local-karaoke-download',
    configureServer(server) {
      server.middlewares.use('/api/dev/karaoke-video', handleKaraokeDownload);
    },
  };
}
