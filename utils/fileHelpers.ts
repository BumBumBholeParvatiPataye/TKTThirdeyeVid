
/**
 * Converts a File object to a Base64 string.
 */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        // Remove the Data URL prefix (e.g., "data:video/mp4;base64,")
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Failed to convert file to base64'));
      }
    };
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Formats file size into readable string.
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Checks if a URL is a YouTube URL and extracts the video ID.
 * Supports standard watch URLs, embeds, shortened links, and Shorts.
 */
export const extractYouTubeId = (url: string): string | null => {
  // Regex covers: youtu.be, v/, u/w/, embed/, watch?v=, &v=, and shorts/
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

/**
 * Scans HTML string for potential video file URLs.
 */
const findVideoUrlInHtml = (html: string, originalUrl: string): string | null => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // 1. Check Standard Metadata
  const metaTags = [
    'meta[property="og:video"]',
    'meta[property="og:video:url"]',
    'meta[property="og:video:secure_url"]',
    'meta[name="twitter:player:stream"]',
    'meta[property="twitter:player:stream"]'
  ];

  for (const selector of metaTags) {
    const content = doc.querySelector(selector)?.getAttribute('content');
    if (content && content !== originalUrl && !content.includes('text/html')) {
      return content;
    }
  }

  // 2. Check HTML5 <video> tags
  const videoSrc = doc.querySelector('video')?.getAttribute('src');
  if (videoSrc) return videoSrc;

  const sourceSrc = doc.querySelector('source[type^="video"]')?.getAttribute('src');
  if (sourceSrc) return sourceSrc;

  // 3. "Brute Force" Regex Scan
  const normalizedHtml = html.replace(/\\\//g, '/');
  const videoRegex = /"(https?:\/\/[^"]+?\.(?:mp4|webm|mov|m4v)(?:\?[^"]*)?)"/gi;
  
  const matches = [...normalizedHtml.matchAll(videoRegex)];
  
  if (matches.length > 0) {
    const distinctUrls = [...new Set(matches.map(m => m[1]))];
    distinctUrls.sort((a, b) => b.length - a.length);
    return distinctUrls[0];
  }

  return null;
};

/**
 * Fetches a video from a URL and returns it as a File object.
 */
export const fetchVideoUrlToFile = async (url: string, depth = 0): Promise<File> => {
  if (depth > 2) {
    throw new Error("Too many redirects or recursive lookups. We couldn't find a direct video file.");
  }

  const performFetch = async (targetUrl: string, useProxy: boolean) => {
    const fetchUrl = useProxy 
      ? `https://corsproxy.io/?${encodeURIComponent(targetUrl)}` 
      : targetUrl;
      
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    return res;
  };

  try {
    let response: Response;
    try {
      response = await performFetch(url, false);
    } catch (directError) {
      console.warn("Direct fetch failed, attempting via proxy...", directError);
      try {
        response = await performFetch(url, true);
      } catch (proxyError) {
        throw new Error('Network request failed. The URL might be invalid or blocked by CORS.');
      }
    }

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/html')) {
      const html = await response.text();
      const extractedUrl = findVideoUrlInHtml(html, url);
      
      if (extractedUrl) {
        const absoluteUrl = new URL(extractedUrl, url).href;
        return fetchVideoUrlToFile(absoluteUrl, depth + 1);
      }
      
      throw new Error('We found the webpage, but couldn\'t automatically extract a video file from it.');
    }

    const blob = await response.blob();
    
    if (blob.size < 1024) {
      throw new Error('The fetched file is too small to be a valid video.');
    }

    let filename = url.split('/').pop()?.split('?')[0] || 'remote_video';
    filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!filename.includes('.')) filename += '.mp4';

    const type = blob.type.startsWith('video/') ? blob.type : 'video/mp4';

    return new File([blob], filename, { type });

  } catch (error: any) {
    console.error("Video Fetch Error:", error);
    throw error;
  }
};
