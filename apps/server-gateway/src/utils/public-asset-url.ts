/**
 * Normalize storage and gateway-relative URLs for API responses and worker payloads.
 */

function trimUrl(url: string | null | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  const trimmed = url.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function rewriteMinioPublicUrl(url: string | null | undefined): string | undefined {
  const trimmed = trimUrl(url);
  if (!trimmed) {
    return undefined;
  }

  const publicEndpoint = process.env.MINIO_PUBLIC_ENDPOINT || 'http://localhost:9000';
  return trimmed
    .replace('http://minio:9000', publicEndpoint)
    .replace('https://minio:9000', publicEndpoint);
}

/** MinIO URLs reachable from Docker workers (not browser localhost). */
export function rewriteMinioInternalUrl(url: string): string {
  const host = process.env.MINIO_ENDPOINT || 'minio';
  const port = process.env.MINIO_PORT || '9000';
  const internalEndpoint = `http://${host}:${port}`;
  const publicEndpoint = process.env.MINIO_PUBLIC_ENDPOINT || 'http://localhost:9000';

  let result = url
    .replace(publicEndpoint, internalEndpoint);

  if (result === url) {
    result = result
      .replace('https://minio:9000', internalEndpoint)
      .replace('http://localhost:9000', internalEndpoint)
      .replace('https://localhost:9000', internalEndpoint);
  }

  return result;
}

function resolveWithGatewayBase(
  url: string,
  gatewayBase: string,
  rewriteMinio: (value: string) => string,
): string {
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) {
    let resolved = url;
    if (/^https?:\/\//i.test(url)) {
      resolved = rewriteMinio(url);
    }
    const base = gatewayBase.replace(/\/$/, '');
    return resolved
      .replace('http://localhost:3000', base)
      .replace('https://localhost:3000', base)
      .replace('http://127.0.0.1:3000', base)
      .replace('https://127.0.0.1:3000', base);
  }

  if (url.startsWith('/')) {
    return `${gatewayBase.replace(/\/$/, '')}${url}`;
  }

  const rewritten = rewriteMinio(url);
  return rewritten ?? url;
}

function defaultWorkerGatewayBase(): string {
  return (
    process.env.GATEWAY_INTERNAL_BASE_URL
    || process.env.GATEWAY_BASE_URL
    || (process.env.NODE_ENV === 'production' ? 'http://server-gateway:3000' : 'http://localhost:3000')
  ).replace(/\/$/, '');
}

function defaultPublicGatewayBase(): string {
  return (
    process.env.GATEWAY_PUBLIC_BASE_URL
    || process.env.GATEWAY_BASE_URL
    || 'http://localhost:3000'
  ).replace(/\/$/, '');
}

/** URLs for BullMQ / worker containers (Docker-internal gateway + MinIO). */
export function resolveWorkerAssetUrl(url: string | null | undefined): string | undefined {
  const trimmed = trimUrl(url);
  if (!trimmed) {
    return undefined;
  }

  return resolveWithGatewayBase(trimmed, defaultWorkerGatewayBase(), rewriteMinioInternalUrl);
}

/** URLs for browser-facing API responses. */
export function resolvePublicAssetUrl(url: string | null | undefined): string | undefined {
  const trimmed = trimUrl(url);
  if (!trimmed) {
    return undefined;
  }

  return resolveWithGatewayBase(trimmed, defaultPublicGatewayBase(), (value) => rewriteMinioPublicUrl(value) ?? value);
}

/** @deprecated Use resolvePublicAssetUrl for API responses or resolveWorkerAssetUrl for worker payloads. */
export function resolveGatewayRelativeUrl(url: string | null | undefined): string | undefined {
  return resolvePublicAssetUrl(url);
}
