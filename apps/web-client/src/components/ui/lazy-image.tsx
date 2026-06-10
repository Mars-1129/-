import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils/cn';

type LazyImageProps = {
  src: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
};

export function LazyImage({ src, alt, className, fallback }: LazyImageProps): JSX.Element {
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const [errored, setErrored] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const setImgRef = useCallback((node: HTMLImageElement | null) => {
    imgRef.current = node;
  }, []);

  // IntersectionObserver 观察始终渲染的外层容器 div，避免死锁
  useEffect(() => {
    const node = containerRef.current;
    if (!node || inView) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '200px',
        threshold: 0.01,
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [inView]);

  // src 变化时重置状态
  useEffect(() => {
    setLoaded(false);
    setErrored(false);
    if (imgRef.current?.complete) {
      setLoaded(true);
    }
  }, [src]);

  if (errored && fallback) {
    return <div ref={containerRef} className={cn('overflow-hidden flex items-center justify-center', className)}>{fallback}</div>;
  }

  return (
    <div ref={containerRef} className={cn('overflow-hidden', className)}>
      {!loaded && !errored && (
        <div className="absolute inset-0 animate-pulse bg-slate-800/70" />
      )}
      {inView && (
        <img
          ref={setImgRef}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          className={cn(
            'h-full w-full object-cover transition-all duration-500',
            loaded ? 'blur-0 scale-100 opacity-100' : 'blur-sm scale-110 opacity-0',
          )}
        />
      )}
    </div>
  );
}
