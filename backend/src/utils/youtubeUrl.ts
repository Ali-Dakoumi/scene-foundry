const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export function isYouTubeHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./i, '').toLowerCase();
  return host === 'youtube.com'
    || host === 'm.youtube.com'
    || host === 'youtu.be'
    || host === 'youtube-nocookie.com';
}

export function normalizeYouTubeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || (url.port && url.port !== '443')
  ) {
    throw new Error('YouTube sources must be public HTTPS URLs without credentials.');
  }

  const host = url.hostname.replace(/^www\./i, '').toLowerCase();
  let videoId: string | undefined;

  if (host === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0];
  } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch' || url.pathname === '/watch/') {
      videoId = url.searchParams.get('v') ?? undefined;
    } else {
      const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)\/?$/);
      videoId = match?.[1];
    }
  } else {
    throw new Error('Only public YouTube URLs can be ingested as video sources.');
  }

  if (!videoId || !YOUTUBE_ID.test(videoId)) {
    throw new Error('The YouTube URL does not contain a valid video id.');
  }

  return `https://www.youtube.com/watch?v=${videoId}`;
}
