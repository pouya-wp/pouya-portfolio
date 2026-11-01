import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        backgroundColor: '#0c0a09',
        color: '#f5f0ea',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        textAlign: 'center',
        fontFamily: 'var(--font-mono, monospace)',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          border: '1px solid rgba(212, 160, 23, 0.28)',
          borderRadius: '2px',
          padding: 'clamp(24px, 4vw, 48px)',
          maxWidth: '560px',
          width: '100%',
          backgroundColor: 'rgba(18, 16, 14, 0.75)',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.8), 0 0 40px rgba(212, 160, 23, 0.08)',
        }}
      >
        <span
          style={{
            color: '#e5a93c',
            fontSize: '11px',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            display: 'block',
            marginBottom: '12px',
          }}
        >
          ✦ SYSTEM ERROR // 404
        </span>

        <h1
          style={{
            fontSize: 'clamp(2.5rem, 6vw, 4rem)',
            fontWeight: 400,
            letterSpacing: '-0.03em',
            margin: '0 0 16px',
            color: '#fff',
          }}
        >
          SEAM VOID
        </h1>

        <p
          style={{
            color: 'rgba(245, 240, 234, 0.65)',
            fontSize: '13px',
            lineHeight: 1.6,
            letterSpacing: '0.04em',
            marginBottom: '32px',
          }}
        >
          The coordinate you requested does not exist within the current architectural timeline.
          The fragments remain intact in the primary continuum.
        </p>

        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#e5a93c',
            color: '#0c0a09',
            padding: '10px 22px',
            borderRadius: '999px',
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            textDecoration: 'none',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
        >
          <span>RETURN TO CONTINUUM</span>
          <span>&rarr;</span>
        </Link>
      </div>
    </main>
  );
}
